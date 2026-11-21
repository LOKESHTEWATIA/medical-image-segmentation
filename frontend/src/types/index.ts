export type UserRole = 'admin' | 'radiologist' | 'researcher' | 'viewer'
export type UserStatus = 'active' | 'inactive' | 'locked' | 'pending_verification'
export type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type ModelType = 'unet' | 'nnunet' | 'attention_unet' | 'swin_unetr' | 'custom'

export interface User {
  id: string
  email: string
  username: string
  full_name: string
  role: UserRole
  status: UserStatus
  institution?: string
  department?: string
  orcid?: string
  created_at: string
  last_login?: string
  mfa_enabled: boolean
}

export interface Task {
  id: string
  user_id: string
  original_filename: string
  stored_filename: string
  file_size: number
  file_hash: string
  modality?: string
  body_part?: string
  model_type: ModelType
  model_version?: string
  status: TaskStatus
  progress: number
  error_message?: string
  output_filename?: string
  output_file_size?: number
  output_file_hash?: string
  metrics?: TaskMetrics
  notes?: string
  is_archived: boolean
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
}

export interface TaskMetrics {
  [key: string]: number
}

export interface TaskListResponse {
  tasks: Task[]
  total: number
  page: number
  page_size: number
}

export interface ModelInfo {
  id: string
  name: string
  model_type: ModelType
  version: string
  description?: string
  architecture?: string
  framework: string
  dataset?: string
  metrics?: Record<string, number>
  is_active: boolean
  is_default: boolean
  min_memory_gb: number
  recommended_gpu_memory_gb: number
  tags?: string[]
  license?: string
  created_at: string
  loaded: boolean
}

export interface ModelLoadResponse {
  success: boolean
  message: string
  info?: {
    name: string
    total_parameters: number
    trainable_parameters: number
    model_size_mb: number
  }
}

export interface SystemStats {
  total_users: number
  active_users: number
  total_tasks: number
  tasks_by_status: Record<string, number>
  tasks_today: number
  storage_used_gb: number
  api_keys_active: number
}

export interface AuditLog {
  id: string
  user_id?: string
  task_id?: string
  event_type: string
  event_category: string
  description: string
  ip_address?: string
  user_agent?: string
  request_id?: string
  resource_type?: string
  resource_id?: string
  success: boolean
  error_code?: string
  error_message?: string
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

export interface ApiError {
  detail: string
  request_id?: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export type FileType = 'segmentation' | 'probabilities' | 'original'

export interface DownloadOptions {
  taskId: string
  fileType: FileType
  filename: string
}