#!/usr/bin/env python3
"""
Model Training Script for MedSeg
Train U-Net or Attention U-Net on medical imaging datasets.

Usage:
    python train.py --config configs/unet_brats.yaml
    python train.py --config configs/attention_unet_custom.yaml --resume checkpoints/last.pth
"""

import argparse
import os
import yaml
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.cuda.amp import GradScaler, autocast
from torch.utils.tensorboard import SummaryWriter
from pathlib import Path
from tqdm import tqdm
import numpy as np
from datetime import datetime
import json

from app.models.unet import UNet3D, AttentionUNet3D, create_model, get_model_info
from app.services.inference import MedicalImagePreprocessor


class MedicalDataset(torch.utils.data.Dataset):
    """Dataset for medical image segmentation."""
    
    def __init__(self, data_dir, split='train', transform=None, config=None):
        self.data_dir = Path(data_dir)
        self.split = split
        self.transform = transform
        self.config = config or {}
        
        # Find all image files
        self.image_files = list(self.data_dir.glob('images/*.nii.gz'))
        self.label_files = [self.data_dir / 'labels' / f.name for f in self.image_files]
        
        # Split
        np.random.seed(42)
        indices = np.random.permutation(len(self.image_files))
        train_split = int(0.8 * len(indices))
        val_split = int(0.9 * len(indices))
        
        if split == 'train':
            indices = indices[:train_split]
        elif split == 'val':
            indices = indices[train_split:val_split]
        else:
            indices = indices[val_split:]
        
        self.image_files = [self.image_files[i] for i in indices]
        self.label_files = [self.label_files[i] for i in indices]
        
        print(f"Loaded {len(self.image_files)} samples for {split}")
    
    def __len__(self):
        return len(self.image_files)
    
    def __getitem__(self, idx):
        import nibabel as nib
        
        # Load image
        img = nib.load(str(self.image_files[idx]))
        image = img.get_fdata(dtype=np.float32)
        
        # Load label
        lbl = nib.load(str(self.label_files[idx]))
        label = lbl.get_fdata(dtype=np.int64)
        
        # Handle 4D data
        if image.ndim == 4:
            image = image[..., 0]
        if label.ndim == 4:
            label = label[..., 0]
        
        # Normalize image
        image = (image - image.mean()) / (image.std() + 1e-8)
        
        # Convert to tensors
        image = torch.from_numpy(image).unsqueeze(0).float()  # (1, D, H, W)
        label = torch.from_numpy(label).long()  # (D, H, W)
        
        if self.transform:
            image, label = self.transform(image, label)
        
        return image, label


def dice_loss(pred, target, smooth=1e-5):
    """Dice loss for segmentation."""
    pred = torch.softmax(pred, dim=1)
    target_one_hot = torch.nn.functional.one_hot(target, num_classes=pred.shape[1]).permute(0, 4, 1, 2, 3).float()
    
    intersection = (pred * target_one_hot).sum(dim=(2, 3, 4))
    union = pred.sum(dim=(2, 3, 4)) + target_one_hot.sum(dim=(2, 3, 4))
    
    dice = (2. * intersection + smooth) / (union + smooth)
    return 1 - dice.mean()


def combined_loss(pred, target, ce_weight=0.5, dice_weight=0.5):
    """Combined CrossEntropy + Dice loss."""
    ce = torch.nn.functional.cross_entropy(pred, target)
    dl = dice_loss(pred, target)
    return ce_weight * ce + dice_weight * dl


def calculate_metrics(pred, target, num_classes):
    """Calculate Dice and IoU per class."""
    pred = torch.argmax(pred, dim=1)
    
    metrics = {}
    for c in range(1, num_classes):  # Skip background
        pred_c = (pred == c).float()
        target_c = (target == c).float()
        
        intersection = (pred_c * target_c).sum()
        union = pred_c.sum() + target_c.sum()
        
        dice = (2 * intersection + 1e-5) / (union + 1e-5)
        iou = (intersection + 1e-5) / (union - intersection + 1e-5)
        
        metrics[f'dice_class_{c}'] = dice.item()
        metrics[f'iou_class_{c}'] = iou.item()
    
    return metrics


def train_one_epoch(model, loader, optimizer, criterion, device, scaler, epoch, writer):
    """Train for one epoch."""
    model.train()
    total_loss = 0
    all_metrics = {}
    
    pbar = tqdm(loader, desc=f'Epoch {epoch} [Train]')
    for batch_idx, (images, labels) in enumerate(pbar):
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        
        optimizer.zero_grad()
        
        with autocast():
            outputs = model(images)
            loss = criterion(outputs, labels)
        
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        
        total_loss += loss.item()
        
        # Calculate metrics
        with torch.no_grad():
            metrics = calculate_metrics(outputs, labels, outputs.shape[1])
            for k, v in metrics.items():
                all_metrics.setdefault(k, []).append(v)
        
        pbar.set_postfix({'loss': loss.item()})
    
    avg_loss = total_loss / len(loader)
    avg_metrics = {k: np.mean(v) for k, v in all_metrics.items()}
    
    return avg_loss, avg_metrics


def validate(model, loader, criterion, device, epoch, writer):
    """Validate model."""
    model.eval()
    total_loss = 0
    all_metrics = {}
    
    with torch.no_grad():
        pbar = tqdm(loader, desc=f'Epoch {epoch} [Val]')
        for images, labels in pbar:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)
            
            with autocast():
                outputs = model(images)
                loss = criterion(outputs, labels)
            
            total_loss += loss.item()
            
            metrics = calculate_metrics(outputs, labels, outputs.shape[1])
            for k, v in metrics.items():
                all_metrics.setdefault(k, []).append(v)
            
            pbar.set_postfix({'loss': loss.item()})
    
    avg_loss = total_loss / len(loader)
    avg_metrics = {k: np.mean(v) for k, v in all_metrics.items()}
    
    return avg_loss, avg_metrics


def main():
    parser = argparse.ArgumentParser(description='Train MedSeg model')
    parser.add_argument('--config', type=str, required=True, help='Path to config YAML')
    parser.add_argument('--resume', type=str, help='Path to checkpoint to resume from')
    parser.add_argument('--device', type=str, default='cuda', help='Device to use')
    args = parser.parse_args()
    
    # Load config
    with open(args.config, 'r') as f:
        config = yaml.safe_load(f)
    
    # Set device
    device = torch.device(args.device if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Create model
    model = create_model(
        model_type=config['model']['type'],
        in_channels=config['model']['in_channels'],
        out_channels=config['model']['out_channels'],
        features=config['model'].get('features', [32, 64, 128, 256, 512]),
        bilinear=config['model'].get('bilinear', True),
        use_batchnorm=config['model'].get('use_batchnorm', True),
        dropout=config['model'].get('dropout', 0.0),
    ).to(device)
    
    print(f"Model created: {get_model_info(model)}")
    
    # Create datasets
    train_dataset = MedicalDataset(
        config['data']['data_dir'],
        split='train',
        config=config
    )
    val_dataset = MedicalDataset(
        config['data']['data_dir'],
        split='val',
        config=config
    )
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=config['training']['batch_size'],
        shuffle=True,
        num_workers=config['training']['num_workers'],
        pin_memory=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=config['training']['batch_size'],
        shuffle=False,
        num_workers=config['training']['num_workers'],
        pin_memory=True,
    )
    
    # Optimizer
    optimizer = optim.AdamW(
        model.parameters(),
        lr=config['training']['learning_rate'],
        weight_decay=config['training'].get('weight_decay', 1e-4),
    )
    
    # Scheduler
    scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer,
        T_0=config['training'].get('scheduler_T0', 10),
        T_mult=1,
        eta_min=1e-6,
    )
    
    # Loss
    criterion = lambda pred, target: combined_loss(
        pred, target,
        ce_weight=config['training'].get('ce_weight', 0.5),
        dice_weight=config['training'].get('dice_weight', 0.5),
    )
    
    # Mixed precision
    scaler = GradScaler()
    
    # Tensorboard
    log_dir = Path(config['training']['log_dir']) / datetime.now().strftime('%Y%m%d_%H%M%S')
    log_dir.mkdir(parents=True, exist_ok=True)
    writer = SummaryWriter(log_dir)
    
    # Checkpoint dir
    checkpoint_dir = Path(config['training']['checkpoint_dir'])
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    # Resume
    start_epoch = 0
    best_val_loss = float('inf')
    
    if args.resume:
        checkpoint = torch.load(args.resume, map_location=device)
        model.load_state_dict(checkpoint['model_state_dict'])
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
        scaler.load_state_dict(checkpoint['scaler_state_dict'])
        start_epoch = checkpoint['epoch'] + 1
        best_val_loss = checkpoint.get('best_val_loss', float('inf'))
        print(f"Resumed from epoch {start_epoch}")
    
    # Training loop
    epochs = config['training']['epochs']
    
    for epoch in range(start_epoch, epochs):
        # Train
        train_loss, train_metrics = train_one_epoch(
            model, train_loader, optimizer, criterion, device, scaler, epoch, writer
        )
        
        # Validate
        val_loss, val_metrics = validate(model, val_loader, criterion, device, epoch, writer)
        
        # Step scheduler
        scheduler.step()
        
        # Log
        writer.add_scalar('Loss/train', train_loss, epoch)
        writer.add_scalar('Loss/val', val_loss, epoch)
        writer.add_scalar('LR', optimizer.param_groups[0]['lr'], epoch)
        
        for k, v in train_metrics.items():
            writer.add_scalar(f'{k}/train', v, epoch)
        for k, v in val_metrics.items():
            writer.add_scalar(f'{k}/val', v, epoch)
        
        # Print
        print(f"Epoch {epoch}: Train Loss={train_loss:.4f}, Val Loss={val_loss:.4f}")
        for k, v in val_metrics.items():
            print(f"  {k}: {v:.4f}")
        
        # Save checkpoint
        is_best = val_loss < best_val_loss
        if is_best:
            best_val_loss = val_loss
        
        checkpoint = {
            'epoch': epoch,
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'scheduler_state_dict': scheduler.state_dict(),
            'scaler_state_dict': scaler.state_dict(),
            'train_loss': train_loss,
            'val_loss': val_loss,
            'best_val_loss': best_val_loss,
            'config': config,
        }
        
        # Save latest
        torch.save(checkpoint, checkpoint_dir / 'latest.pth')
        
        # Save best
        if is_best:
            torch.save(checkpoint, checkpoint_dir / 'best.pth')
            print(f"  New best model saved! Val loss: {val_loss:.4f}")
        
        # Save periodic
        if (epoch + 1) % config['training'].get('save_every', 10) == 0:
            torch.save(checkpoint, checkpoint_dir / f'epoch_{epoch}.pth')
    
    writer.close()
    print("Training completed!")


if __name__ == '__main__':
    main()