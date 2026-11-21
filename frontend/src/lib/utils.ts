import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateString)
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'badge-warning',
    queued: 'badge-info',
    processing: 'badge-primary',
    completed: 'badge-success',
    failed: 'badge-danger',
    cancelled: 'badge-secondary',
    active: 'badge-success',
    inactive: 'badge-secondary',
    locked: 'badge-danger',
    pending_verification: 'badge-warning',
  }
  return colors[status] || 'badge-secondary'
}

export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    admin: 'badge-danger',
    radiologist: 'badge-primary',
    researcher: 'badge-info',
    viewer: 'badge-secondary',
  }
  return colors[role] || 'badge-secondary'
}

export function getModelTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    unet: 'U-Net',
    nnunet: 'nnU-Net',
    attention_unet: 'Attention U-Net',
    swin_unetr: 'Swin UNETR',
    custom: 'Custom',
  }
  return labels[type] || type
}

export function validateFileType(file: File): { valid: boolean; error?: string } {
  const allowedExtensions = ['.nii', '.nii.gz', '.dcm', '.dicom', '.mha', '.mhd']
  const allowedMimeTypes = [
    'application/octet-stream',
    'application/dicom',
    'image/x-nifti',
    'application/x-nifti',
  ]

  const extension = file.name.toLowerCase().match(/\.(nii(\.gz)?|dcm|dicom|mha|mhd)$/)?.[0]
  if (!extension || !allowedExtensions.includes(extension)) {
    return { valid: false, error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}` }
  }

  if (!allowedMimeTypes.includes(file.type) && file.type !== '') {
    // Allow empty type (browser might not detect)
    console.warn(`Unexpected MIME type: ${file.type}`)
  }

  return { valid: true }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export function isTokenExpiringSoon(token: string, bufferMinutes = 5): boolean {
  const payload = parseJwt(token)
  if (!payload || !payload.exp) return true
  const expiryTime = payload.exp * 1000
  const bufferTime = bufferMinutes * 60 * 1000
  return Date.now() >= expiryTime - bufferTime
}

export const MEDICAL_MODALITIES = [
  'CT',
  'MRI',
  'PET',
  'SPECT',
  'Ultrasound',
  'X-Ray',
  'Mammography',
  'Other',
] as const

export const BODY_PARTS = [
  'Brain',
  'Head & Neck',
  'Spine',
  'Chest',
  'Abdomen',
  'Pelvis',
  'Musculoskeletal',
  'Cardiac',
  'Vascular',
  'Other',
] as const

export const CLASS_COLORS = [
  '#ef4444', // red
  '#22c55e', // green
  '#3b82f6', // blue
  '#f97316', // orange
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
] as const