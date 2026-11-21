import os
import uuid
import time
import numpy as np
import torch
import torch.nn.functional as F
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import structlog

import nibabel as nib
import SimpleITK as sitk

from app.core.config import settings
from app.models.unet import (
    UNet3D,
    AttentionUNet3D,
    create_model,
    load_model_checkpoint,
    get_model_info,
)
from app.utils.file_validation import calculate_file_hash

logger = structlog.get_logger(__name__)


@dataclass
class InferenceResult:
    """Result of segmentation inference."""
    output_path: str
    output_hash: str
    file_size: int
    metrics: Dict[str, float]
    processing_time_ms: int
    metadata: Dict[str, Any]


@dataclass
class ModelMetadata:
    """Model metadata for inference."""
    name: str
    model_type: str
    version: str
    in_channels: int
    out_channels: int
    input_shape: Tuple[int, int, int]  # D, H, W
    spacing: Tuple[float, float, float]
    class_names: List[str]
    preprocessing: Dict[str, Any]


class MedicalImagePreprocessor:
    """Preprocess medical images for inference."""
    
    def __init__(
        self,
        target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
        target_shape: Optional[Tuple[int, int, int]] = None,
        normalize: bool = True,
        clip_range: Optional[Tuple[float, float]] = None,
    ):
        self.target_spacing = target_spacing
        self.target_shape = target_shape
        self.normalize = normalize
        self.clip_range = clip_range
    
    def load_image(self, file_path: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Load medical image and extract metadata."""
        path = Path(file_path)
        suffix = path.suffix.lower()
        
        if suffix in [".nii", ".gz"] or file_path.endswith(".nii.gz"):
            return self._load_nifti(file_path)
        elif suffix in [".dcm", ".dicom"]:
            return self._load_dicom(file_path)
        elif suffix in [".mha", ".mhd"]:
            return self._load_mha(file_path)
        else:
            raise ValueError(f"Unsupported file format: {suffix}")
    
    def _load_nifti(self, file_path: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Load NIfTI file."""
        img = nib.load(file_path)
        data = img.get_fdata(dtype=np.float32)
        
        # Handle 4D data (e.g., multi-channel or time series)
        if data.ndim == 4:
            # Take first volume or average
            data = data[..., 0]
        
        affine = img.affine
        header = img.header
        
        metadata = {
            "affine": affine,
            "spacing": self._get_spacing_from_affine(affine),
            "origin": affine[:3, 3],
            "direction": affine[:3, :3],
            "shape": data.shape,
            "dtype": str(data.dtype),
        }
        
        return data, metadata
    
    def _load_dicom(self, file_path: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Load DICOM series."""
        reader = sitk.ImageSeriesReader()
        dicom_names = reader.GetGDCMSeriesFileNames(str(Path(file_path).parent))
        
        if not dicom_names:
            # Single DICOM file
            img = sitk.ReadImage(file_path)
        else:
            reader.SetFileNames(dicom_names)
            img = reader.Execute()
        
        data = sitk.GetArrayFromImage(img).astype(np.float32)
        # SimpleITK returns (z, y, x), we want (x, y, z) for consistency
        data = np.transpose(data, (2, 1, 0))
        
        metadata = {
            "spacing": img.GetSpacing()[::-1],  # Reverse to (x, y, z)
            "origin": img.GetOrigin()[::-1],
            "direction": np.array(img.GetDirection()).reshape(3, 3)[::-1, ::-1],
            "shape": data.shape,
            "dtype": str(data.dtype),
        }
        
        return data, metadata
    
    def _load_mha(self, file_path: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Load MHA/MHD file."""
        img = sitk.ReadImage(file_path)
        data = sitk.GetArrayFromImage(img).astype(np.float32)
        data = np.transpose(data, (2, 1, 0))
        
        metadata = {
            "spacing": img.GetSpacing()[::-1],
            "origin": img.GetOrigin()[::-1],
            "direction": np.array(img.GetDirection()).reshape(3, 3)[::-1, ::-1],
            "shape": data.shape,
            "dtype": str(data.dtype),
        }
        
        return data, metadata
    
    def _get_spacing_from_affine(self, affine: np.ndarray) -> Tuple[float, float, float]:
        """Extract voxel spacing from affine matrix."""
        spacing = np.sqrt(np.sum(affine[:3, :3] ** 2, axis=0))
        return tuple(spacing)
    
    def preprocess(self, data: np.ndarray, metadata: Dict[str, Any]) -> Tuple[torch.Tensor, Dict[str, Any]]:
        """Preprocess image for model input."""
        original_shape = data.shape
        original_spacing = metadata.get("spacing", (1.0, 1.0, 1.0))
        
        # Resample to target spacing if needed
        if self.target_spacing != original_spacing:
            data = self._resample(data, original_spacing, self.target_spacing)
            metadata["resampled_spacing"] = self.target_spacing
        
        # Clip intensity values
        if self.clip_range:
            data = np.clip(data, self.clip_range[0], self.clip_range[1])
        
        # Normalize
        if self.normalize:
            data = self._normalize(data)
        
        # Resize to target shape if specified
        if self.target_shape and data.shape != self.target_shape:
            data = self._resize(data, self.target_shape)
            metadata["resized_shape"] = self.target_shape
        
        # Add batch and channel dimensions: (D, H, W) -> (1, 1, D, H, W)
        tensor = torch.from_numpy(data).unsqueeze(0).unsqueeze(0).float()
        
        preprocessing_info = {
            "original_shape": original_shape,
            "original_spacing": original_spacing,
            "final_shape": data.shape,
            "normalized": self.normalize,
            "clipped": self.clip_range is not None,
        }
        
        metadata["preprocessing"] = preprocessing_info
        
        return tensor, metadata
    
    def _normalize(self, data: np.ndarray) -> np.ndarray:
        """Z-score normalization."""
        mean = data.mean()
        std = data.std()
        if std > 0:
            return (data - mean) / std
        return data - mean
    
    def _resample(
        self,
        data: np.ndarray,
        original_spacing: Tuple[float, float, float],
        target_spacing: Tuple[float, float, float],
    ) -> np.ndarray:
        """Resample image to target spacing using SimpleITK."""
        # Convert to SimpleITK image
        img = sitk.GetImageFromArray(np.transpose(data, (2, 1, 0)))
        img.SetSpacing(original_spacing[::-1])
        
        # Calculate new size
        original_size = img.GetSize()
        new_size = [
            int(round(original_size[i] * (original_spacing[i] / target_spacing[i])))
            for i in range(3)
        ]
        
        # Resample
        resampler = sitk.ResampleImageFilter()
        resampler.SetOutputSpacing(target_spacing[::-1])
        resampler.SetSize(new_size)
        resampler.SetOutputDirection(img.GetDirection())
        resampler.SetOutputOrigin(img.GetOrigin())
        resampler.SetTransform(sitk.Transform())
        resampler.SetDefaultPixelValue(0)
        resampler.SetInterpolator(sitk.sitkLinear)
        
        resampled = resampler.Execute(img)
        result = sitk.GetArrayFromImage(resampled)
        return np.transpose(result, (2, 1, 0))
    
    def _resize(self, data: np.ndarray, target_shape: Tuple[int, int, int]) -> np.ndarray:
        """Resize image to target shape using torch interpolation."""
        tensor = torch.from_numpy(data).unsqueeze(0).unsqueeze(0).float()
        resized = F.interpolate(
            tensor,
            size=target_shape,
            mode="trilinear",
            align_corners=True,
        )
        return resized.squeeze(0).squeeze(0).numpy()


class MedicalImagePostprocessor:
    """Postprocess model predictions."""
    
    def __init__(
        self,
        class_names: List[str],
        threshold: float = 0.5,
        keep_largest_component: bool = True,
        min_component_size: int = 100,
    ):
        self.class_names = class_names
        self.threshold = threshold
        self.keep_largest_component = keep_largest_component
        self.min_component_size = min_component_size
    
    def postprocess(
        self,
        logits: torch.Tensor,
        original_metadata: Dict[str, Any],
        target_shape: Optional[Tuple[int, int, int]] = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Convert logits to segmentation mask."""
        # Apply softmax
        probs = F.softmax(logits, dim=1)  # (1, C, D, H, W)
        probs = probs.squeeze(0).cpu().numpy()  # (C, D, H, W)
        
        # Get predicted classes
        pred = np.argmax(probs, axis=0).astype(np.uint8)  # (D, H, W)
        
        # Resize back to original shape if needed
        original_shape = original_metadata.get("original_shape")
        if target_shape and original_shape and pred.shape != original_shape:
            pred = self._resize_mask(pred, original_shape)
            probs = self._resize_probs(probs, original_shape)
        
        # Post-process each class
        if self.keep_largest_component:
            pred = self._keep_largest_components(pred)
        
        # Calculate metrics
        metrics = self._calculate_metrics(probs, pred)
        
        postprocess_info = {
            "threshold": self.threshold,
            "largest_component_only": self.keep_largest_component,
            "num_classes": len(self.class_names),
        }
        
        return pred, {**original_metadata, "postprocessing": postprocess_info, "metrics": metrics}
    
    def _resize_mask(self, mask: np.ndarray, target_shape: Tuple[int, int, int]) -> np.ndarray:
        """Resize mask using nearest neighbor."""
        tensor = torch.from_numpy(mask).unsqueeze(0).unsqueeze(0).float()
        resized = F.interpolate(tensor, size=target_shape, mode="nearest")
        return resized.squeeze(0).squeeze(0).numpy().astype(np.uint8)
    
    def _resize_probs(self, probs: np.ndarray, target_shape: Tuple[int, int, int]) -> np.ndarray:
        """Resize probability maps."""
        tensor = torch.from_numpy(probs).unsqueeze(0).float()  # (1, C, D, H, W)
        resized = F.interpolate(tensor, size=target_shape, mode="trilinear", align_corners=True)
        return resized.squeeze(0).numpy()
    
    def _keep_largest_components(self, mask: np.ndarray) -> np.ndarray:
        """Keep only largest connected component for each class."""
        from scipy import ndimage
        
        result = np.zeros_like(mask)
        
        for class_id in range(1, len(self.class_names)):  # Skip background (0)
            class_mask = (mask == class_id).astype(np.uint8)
            
            if class_mask.sum() == 0:
                continue
            
            # Label connected components
            labeled, num_features = ndimage.label(class_mask)
            
            if num_features == 0:
                continue
            
            # Find largest component
            component_sizes = ndimage.sum(class_mask, labeled, range(1, num_features + 1))
            largest_component = np.argmax(component_sizes) + 1
            
            # Keep only largest if it's big enough
            if component_sizes[largest_component - 1] >= self.min_component_size:
                result[labeled == largest_component] = class_id
        
        return result
    
    def _calculate_metrics(self, probs: np.ndarray, pred: np.ndarray) -> Dict[str, float]:
        """Calculate segmentation metrics."""
        metrics = {}
        
        for class_id, class_name in enumerate(self.class_names):
            if class_id == 0:  # Skip background
                continue
            
            # Confidence (mean probability for predicted class)
            class_probs = probs[class_id]
            class_mask = (pred == class_id)
            
            if class_mask.sum() > 0:
                metrics[f"{class_name}_mean_confidence"] = float(class_probs[class_mask].mean())
                metrics[f"{class_name}_volume_voxels"] = int(class_mask.sum())
                metrics[f"{class_name}_volume_mm3"] = float(
                    class_mask.sum() * np.prod(probs.shape[1:]) / np.prod(pred.shape)
                )
        
        return metrics


class SegmentationInferenceService:
    """Main service for running segmentation inference."""
    
    def __init__(
        self,
        model_dir: str = "/app/models",
        device: str = "cuda",
    ):
        self.model_dir = Path(model_dir)
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.models: Dict[str, nn.Module] = {}
        self.model_metadata: Dict[str, ModelMetadata] = {}
        self.preprocessors: Dict[str, MedicalImagePreprocessor] = {}
        self.postprocessors: Dict[str, MedicalImagePostprocessor] = {}
        
        logger.info("inference_service_initialized", device=str(self.device))
    
    def load_model(self, model_name: str) -> bool:
        """Load a model by name."""
        if model_name in self.models:
            return True
        
        # Find model file
        model_files = list(self.model_dir.glob(f"{model_name}*.pth")) + \
                      list(self.model_dir.glob(f"{model_name}*.pt")) + \
                      list(self.model_dir.glob(f"{model_name}*.ckpt"))
        
        if not model_files:
            logger.error("model_file_not_found", model=model_name, dir=str(self.model_dir))
            return False
        
        model_path = model_files[0]
        
        try:
            # Load checkpoint to get config
            checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
            
            # Extract model config
            config = checkpoint.get("config", {})
            model_type = config.get("model_type", "unet")
            in_channels = config.get("in_channels", 1)
            out_channels = config.get("out_channels", 4)
            features = config.get("features", [32, 64, 128, 256, 512])
            bilinear = config.get("bilinear", True)
            use_batchnorm = config.get("use_batchnorm", True)
            dropout = config.get("dropout", 0.0)
            
            # Create model
            model = create_model(
                model_type=model_type,
                in_channels=in_channels,
                out_channels=out_channels,
                features=features,
                bilinear=bilinear,
                use_batchnorm=use_batchnorm,
                dropout=dropout,
            )
            
            # Load weights
            model = load_model_checkpoint(model, str(model_path), self.device)
            
            # Store model and metadata
            self.models[model_name] = model
            
            self.model_metadata[model_name] = ModelMetadata(
                name=model_name,
                model_type=model_type,
                version=config.get("version", "1.0.0"),
                in_channels=in_channels,
                out_channels=out_channels,
                input_shape=tuple(config.get("input_shape", [128, 128, 128])),
                spacing=tuple(config.get("spacing", [1.0, 1.0, 1.0])),
                class_names=config.get("class_names", ["background", "class1", "class2", "class3"]),
                preprocessing=config.get("preprocessing", {}),
            )
            
            # Create preprocessor/postprocessor
            prep_config = self.model_metadata[model_name].preprocessing
            self.preprocessors[model_name] = MedicalImagePreprocessor(
                target_spacing=tuple(prep_config.get("target_spacing", [1.0, 1.0, 1.0])),
                target_shape=tuple(prep_config.get("target_shape", self.model_metadata[model_name].input_shape)),
                normalize=prep_config.get("normalize", True),
                clip_range=tuple(prep_config.get("clip_range")) if prep_config.get("clip_range") else None,
            )
            
            self.postprocessors[model_name] = MedicalImagePostprocessor(
                class_names=self.model_metadata[model_name].class_names,
                threshold=prep_config.get("threshold", 0.5),
                keep_largest_component=prep_config.get("keep_largest_component", True),
                min_component_size=prep_config.get("min_component_size", 100),
            )
            
            logger.info("model_loaded", model=model_name, info=get_model_info(model))
            return True
            
        except Exception as e:
            logger.error("model_load_failed", model=model_name, error=str(e))
            return False
    
    def unload_model(self, model_name: str):
        """Unload a model to free memory."""
        if model_name in self.models:
            del self.models[model_name]
            del self.model_metadata[model_name]
            del self.preprocessors[model_name]
            del self.postprocessors[model_name]
            torch.cuda.empty_cache()
            logger.info("model_unloaded", model=model_name)
    
    def list_loaded_models(self) -> List[str]:
        """List currently loaded models."""
        return list(self.models.keys())
    
    def get_model_info(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Get model information."""
        if model_name not in self.models:
            return None
        
        info = get_model_info(self.models[model_name])
        info.update({
            "name": model_name,
            "metadata": self.model_metadata[model_name].__dict__,
        })
        return info
    
    async def run_inference(
        self,
        model_name: str,
        input_path: str,
        output_path: str,
        save_probabilities: bool = False,
    ) -> InferenceResult:
        """Run segmentation inference on a medical image."""
        start_time = time.time()
        
        # Load model if not loaded
        if model_name not in self.models:
            if not self.load_model(model_name):
                raise ValueError(f"Model {model_name} not found or failed to load")
        
        model = self.models[model_name]
        preprocessor = self.preprocessors[model_name]
        postprocessor = self.postprocessors[model_name]
        metadata = self.model_metadata[model_name]
        
        logger.info("inference_started", model=model_name, input=input_path)
        
        try:
            # Load and preprocess image
            image_data, image_metadata = preprocessor.load_image(input_path)
            input_tensor, prep_metadata = preprocessor.preprocess(image_data, image_metadata)
            
            # Move to device
            input_tensor = input_tensor.to(self.device)
            
            # Run inference
            with torch.no_grad():
                logits = model(input_tensor)
            
            # Postprocess
            prediction, post_metadata = postprocessor.postprocess(
                logits,
                {**image_metadata, **prep_metadata},
                target_shape=image_metadata.get("original_shape"),
            )
            
            # Save output
            output_path = self._save_prediction(
                prediction,
                output_path,
                image_metadata,
                metadata.class_names,
            )
            
            # Save probabilities if requested
            if save_probabilities:
                prob_path = output_path.replace(".nii.gz", "_probs.nii.gz")
                self._save_probabilities(logits, prob_path, image_metadata)
            
            # Calculate file hash and size
            output_hash = calculate_file_hash(output_path)
            file_size = os.path.getsize(output_path)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            result = InferenceResult(
                output_path=output_path,
                output_hash=output_hash,
                file_size=file_size,
                metrics=post_metadata.get("metrics", {}),
                processing_time_ms=processing_time_ms,
                metadata={
                    "model": model_name,
                    "input_shape": image_data.shape,
                    "output_shape": prediction.shape,
                    "spacing": image_metadata.get("spacing"),
                    "class_names": metadata.class_names,
                },
            )
            
            logger.info(
                "inference_completed",
                model=model_name,
                time_ms=processing_time_ms,
                output=output_path,
            )
            
            return result
            
        except Exception as e:
            logger.error("inference_failed", model=model_name, error=str(e))
            raise
    
    def _save_prediction(
        self,
        prediction: np.ndarray,
        output_path: str,
        metadata: Dict[str, Any],
        class_names: List[str],
    ) -> str:
        """Save prediction as NIfTI file."""
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Use original affine if available
        affine = metadata.get("affine", np.eye(4))
        
        # Create NIfTI image
        nifti_img = nib.Nifti1Image(prediction.astype(np.uint8), affine)
        
        # Add class names to header description
        nifti_img.header.set_descrip(f"Classes: {','.join(class_names)}".encode())
        
        nib.save(nifti_img, str(output_path))
        
        return str(output_path)
    
    def _save_probabilities(
        self,
        logits: torch.Tensor,
        output_path: str,
        metadata: Dict[str, Any],
    ):
        """Save probability maps as multi-channel NIfTI."""
        probs = F.softmax(logits, dim=1).squeeze(0).cpu().numpy()  # (C, D, H, W)
        probs = np.transpose(probs, (1, 2, 3, 0))  # (D, H, W, C)
        
        affine = metadata.get("affine", np.eye(4))
        nifti_img = nib.Nifti1Image(probs.astype(np.float32), affine)
        nib.save(nifti_img, output_path)