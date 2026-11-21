import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { getAuthTokens, setAuthTokens, clearAuthTokens, refreshAccessToken } from './authStorage'

// API base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 30000,
})

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = getAuthTokens()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle token refresh
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: Error) => void
}> = []

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token!)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Handle 401 - token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue the request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const newAccessToken = await refreshAccessToken()
        processQueue(null, newAccessToken)
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as Error, null)
        clearAuthTokens()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // Handle other errors
    return Promise.reject(error)
  }
)

// API endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  register: (data: {
    email: string
    username: string
    password: string
    full_name: string
    institution?: string
    department?: string
    orcid?: string
  }) => api.post('/auth/register', data),

  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refresh_token: refreshToken }),

  logout: () => api.post('/auth/logout'),

  me: () => api.get('/auth/me'),

  updateProfile: (data: {
    full_name?: string
    institution?: string
    department?: string
    orcid?: string
  }) => api.patch('/auth/me', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }),
}

export const tasksApi = {
  list: (params?: {
    page?: number
    page_size?: number
    status?: string
    model_type?: string
  }) => api.get('/tasks', { params }),

  create: (file: File, data: {
    model_type: string
    model_version?: string
    modality?: string
    body_part?: string
    notes?: string
  }) => {
    const formData = new FormData()
    formData.append('file', file)
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, value)
    })
    return api.post('/tasks/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        // Progress handled by component
      },
    })
  },

  get: (taskId: string) => api.get(`/tasks/${taskId}`),

  getStatus: (taskId: string) => api.get(`/tasks/${taskId}/status`),

  download: (taskId: string, fileType: 'segmentation' | 'probabilities' | 'original' = 'segmentation') =>
    api.get(`/tasks/${taskId}/download`, {
      params: { file_type: fileType },
      responseType: 'blob',
    }),

  cancel: (taskId: string) => api.patch(`/tasks/${taskId}/cancel`),

  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
}

export const modelsApi = {
  list: (params?: { model_type?: string; active_only?: boolean }) =>
    api.get('/models', { params }),

  get: (modelName: string) => api.get(`/models/${modelName}`),

  getDefault: () => api.get('/models/default/info'),

  load: (modelName: string) => api.post('/models/load', { model_name: modelName }),

  unload: (modelName: string) => api.post('/models/unload', { model_name: modelName }),

  getLoaded: () => api.get('/models/loaded/list'),
}

export const adminApi = {
  getStats: () => api.get('/admin/stats'),

  listUsers: (params?: {
    page?: number
    page_size?: number
    role?: string
    status?: string
    search?: string
  }) => api.get('/admin/users', { params }),

  getUser: (userId: string) => api.get(`/admin/users/${userId}`),

  updateUserRole: (userId: string, role: string) =>
    api.patch(`/admin/users/${userId}/role`, { role }),

  updateUserStatus: (userId: string, status: string) =>
    api.patch(`/admin/users/${userId}/status`, { status }),

  getAuditLogs: (params?: {
    page?: number
    page_size?: number
    user_id?: string
    event_type?: string
    event_category?: string
    success?: boolean
    start_date?: string
    end_date?: string
  }) => api.get('/admin/audit-logs', { params }),

  getAllTasks: (params?: {
    page?: number
    page_size?: number
    status?: string
    user_id?: string
  }) => api.get('/admin/tasks', { params }),

  triggerCleanup: (days: number) => api.post('/admin/maintenance/cleanup', null, { params: { days } }),

  getDetailedHealth: () => api.get('/admin/health/detailed'),
}

export default api