import os
import magic
import hashlib
from pathlib import Path
from typing import Tuple, Optional, List
from fastapi import UploadFile, HTTPException, status
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

# Medical imaging file signatures
DICOM_SIGNATURE = b"DICM"
NIFTI_SIGNATURES = [
    b"ni1\x00",  # NIfTI-1 little endian
    b"\x00ni1",  # NIfTI-1 big endian
    b"n+1\x00",  # NIfTI-1 extended
]

# Allowed MIME types with their magic signatures
ALLOWED_FILE_TYPES = {
    "application/dicom": {
        "extensions": [".dcm", ".dicom"],
        "magic_signatures": [DICOM_SIGNATURE],
        "offset": 128,  # DICOM signature at offset 128
    },
    "image/x-nifti": {
        "extensions": [".nii", ".nii.gz"],
        "magic_signatures": NIFTI_SIGNATURES,
        "offset": 0,
    },
    "application/x-nifti": {
        "extensions": [".nii", ".nii.gz"],
        "magic_signatures": NIFTI_SIGNATURES,
        "offset": 0,
    },
    "application/octet-stream": {
        "extensions": [".mha", ".mhd", ".nrrd"],
        "magic_signatures": [],  # Generic, validate by extension
        "offset": 0,
    },
}


class FileValidationError(Exception):
    """Raised when file validation fails."""
    pass


def validate_file_extension(filename: str) -> bool:
    """Validate file extension is allowed."""
    ext = Path(filename).suffix.lower()
    # Handle .nii.gz
    if filename.lower().endswith(".nii.gz"):
        ext = ".nii.gz"
    
    return ext in settings.ALLOWED_EXTENSIONS


def validate_mime_type(mime_type: str) -> bool:
    """Validate MIME type is allowed."""
    return mime_type in settings.ALLOWED_MIME_TYPES


async def validate_file_content(file: UploadFile) -> Tuple[bool, Optional[str]]:
    """
    Validate file content using python-magic.
    Returns (is_valid, detected_mime_type)
    """
    # Read first 8KB for magic detection
    header = await file.read(8192)
    await file.seek(0)
    
    if not header:
        return False, None
    
    # Use python-magic to detect MIME type
    mime_type = magic.from_buffer(header, mime=True)
    
    # Additional validation for known medical formats
    if mime_type == "application/dicom":
        # DICOM signature at offset 128
        if len(header) >= 132 and header[128:132] == DICOM_SIGNATURE:
            return True, mime_type
        return False, mime_type
    
    elif mime_type in ["image/x-nifti", "application/x-nifti"]:
        # Check NIfTI signatures at offset 0
        for sig in NIFTI_SIGNATURES:
            if header.startswith(sig):
                return True, mime_type
        return False, mime_type
    
    elif mime_type == "application/octet-stream":
        # Generic binary - validate by extension only
        return True, mime_type
    
    return mime_type in settings.ALLOWED_MIME_TYPES, mime_type


def calculate_file_hash(file_path: str, algorithm: str = "sha256") -> str:
    """Calculate file hash."""
    hash_func = hashlib.new(algorithm)
    
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hash_func.update(chunk)
    
    return hash_func.hexdigest()


async def calculate_upload_hash(file: UploadFile) -> str:
    """Calculate hash of uploaded file without saving."""
    hash_func = hashlib.sha256()
    
    while chunk := await file.read(8192):
        hash_func.update(chunk)
    
    await file.seek(0)
    return hash_func.hexdigest()


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe storage."""
    # Remove path components
    filename = Path(filename).name
    
    # Remove dangerous characters
    dangerous_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0']
    for char in dangerous_chars:
        filename = filename.replace(char, '_')
    
    # Limit length
    if len(filename) > 255:
        name, ext = Path(filename).stem, Path(filename).suffix
        if filename.lower().endswith(".nii.gz"):
            ext = ".nii.gz"
            name = filename[:-7]
        filename = name[:255 - len(ext)] + ext
    
    return filename


def generate_stored_filename(original_filename: str, file_hash: str) -> str:
    """Generate unique stored filename."""
    ext = Path(original_filename).suffix.lower()
    if original_filename.lower().endswith(".nii.gz"):
        ext = ".nii.gz"
    
    # Use first 16 chars of hash + original extension
    return f"{file_hash[:16]}{ext}"


def validate_file_size(file_size: int) -> bool:
    """Validate file size is within limits."""
    return file_size <= settings.MAX_FILE_SIZE


def get_file_size(file: UploadFile) -> int:
    """Get file size from UploadFile."""
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    return size


async def validate_upload_file(file: UploadFile) -> dict:
    """
    Comprehensive file validation for uploads.
    Returns validation result with metadata.
    """
    errors = []
    warnings = []
    
    # Check filename
    if not file.filename:
        errors.append("No filename provided")
        return {"valid": False, "errors": errors}
    
    original_filename = file.filename
    sanitized = sanitize_filename(original_filename)
    
    if sanitized != original_filename:
        warnings.append("Filename sanitized for safety")
    
    # Validate extension
    if not validate_file_extension(sanitized):
        errors.append(f"File extension not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}")
    
    # Get file size
    file_size = get_file_size(file)
    
    if not validate_file_size(file_size):
        errors.append(f"File size exceeds maximum of {settings.MAX_FILE_SIZE / (1024**3):.1f}GB")
    
    if file_size == 0:
        errors.append("File is empty")
    
    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    if not validate_mime_type(content_type):
        warnings.append(f"Declared MIME type '{content_type}' not in allowed list")
    
    # Validate actual content
    is_valid_content, detected_mime = await validate_file_content(file)
    
    if not is_valid_content:
        errors.append(f"File content validation failed. Detected type: {detected_mime}")
    
    # Calculate hash
    file_hash = await calculate_upload_hash(file)
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "metadata": {
            "original_filename": original_filename,
            "sanitized_filename": sanitized,
            "file_size": file_size,
            "declared_mime_type": content_type,
            "detected_mime_type": detected_mime,
            "file_hash": file_hash,
            "extension": Path(sanitized).suffix.lower(),
        },
    }


def ensure_upload_dir() -> Path:
    """Ensure upload directory exists with proper permissions."""
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
    return upload_dir


def get_upload_path(filename: str) -> Path:
    """Get full path for uploaded file."""
    return ensure_upload_dir() / filename


def delete_file(file_path: str) -> bool:
    """Safely delete a file."""
    try:
        path = Path(file_path)
        if path.exists() and path.is_file():
            path.unlink()
            return True
    except Exception as e:
        logger.error("file_delete_failed", path=file_path, error=str(e))
    return False