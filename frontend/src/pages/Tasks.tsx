import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { tasksApi, modelsApi } from '../../lib/api'
import { Task, TaskStatus, ModelType, ModelInfo } from '../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Table, Pagination } from '../../components/ui/Table'
import { Modal } from '../../components/ui/Modal'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { LoadingOverlay } from '../../components/ui/LoadingSpinner'
import {
  FileText,
  Upload,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react'
import { formatRelativeTime, getStatusColor, validateFileType, cn, MEDICAL_MODALITIES, BODY_PARTS } from '../../lib/utils'
import { statusIcons } from './Dashboard'

const taskSchema = z.object({
  model_type: z.nativeEnum(ModelType),
  model_version: z.string().optional(),
  modality: z.string().optional(),
  body_part: z.string().optional(),
  notes: z.string().optional(),
})

type TaskFormData = z.infer<typeof taskSchema>

export function Tasks() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [modelFilter, setModelFilter] = useState<ModelType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: { model_type: 'unet' },
  })

  const selectedModel = models.find(m => m.name === watch('model_type'))

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await modelsApi.list({ active_only: true })
        setModels(response.data)
      } catch (error) {
        console.error('Failed to fetch models:', error)
      }
    }
    fetchModels()
  }, [])

  const fetchTasks = async () => {
    setIsLoading(true)
    try {
      const response = await tasksApi.list({
        page,
        page_size: pageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
        model_type: modelFilter === 'all' ? undefined : modelFilter,
      })
      setTasks(response.data.tasks)
      setTotal(response.data.total)
    } catch (error) {
      toast.error('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [page, pageSize, statusFilter, modelFilter])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateFileType(file)
    if (!validation.valid) {
      setFileError(validation.error || 'Invalid file type')
      setSelectedFile(null)
      return
    }

    setFileError(null)
    setSelectedFile(file)
  }

  const onSubmit = async (data: TaskFormData) => {
    if (!selectedFile) {
      setFileError('Please select a file')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const response = await tasksApi.create(selectedFile, data)
      toast.success('Task created successfully!')
      setShowUploadModal(false)
      reset()
      setSelectedFile(null)
      setUploadProgress(0)
      fetchTasks()
      navigate(`/tasks/${response.data.id}`)
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to create task'
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) return

    try {
      await tasksApi.delete(taskId)
      toast.success('Task deleted')
      fetchTasks()
    } catch (error) {
      toast.error('Failed to delete task')
    }
  }

  const handleCancel = async (taskId: string) => {
    if (!confirm('Are you sure you want to cancel this task?')) return

    try {
      await tasksApi.cancel(taskId)
      toast.success('Task cancelled')
      fetchTasks()
    } catch (error) {
      toast.error('Failed to cancel task')
    }
  }

  const columns = [
    { key: 'filename', header: 'File', render: (row: Task) => (
      <div className="min-w-[200px]">
        <p className="font-medium truncate" title={row.original_filename}>{row.original_filename}</p>
        <p className="text-xs text-surface-500">
          {row.modality || 'Unknown'} • {row.body_part || 'Unknown'} • {formatFileSize(row.file_size)}
        </p>
      </div>
    )},
    { key: 'model', header: 'Model', render: (row: Task) => (
      <span className="text-sm font-mono px-2 py-0.5 bg-surface-100 dark:bg-surface-800 rounded">{row.model_type.toUpperCase()}</span>
    )},
    { key: 'status', header: 'Status', render: (row: Task) => {
      const Icon = statusIcons[row.status as keyof typeof statusIcons] || Clock
      const variant = getStatusColor(row.status).replace('badge-', '')
      return (
        <Badge variant={variant as any} className="gap-1">
          <Icon className="w-3 h-3" />
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </Badge>
      )
    }},
    { key: 'progress', header: 'Progress', render: (row: Task) => (
      <div className="w-40">
        <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300',
              row.status === 'completed' && 'bg-green-500',
              row.status === 'failed' && 'bg-red-500',
              row.status === 'processing' && 'bg-primary-500',
              row.status === 'queued' && 'bg-blue-500',
              row.status === 'pending' && 'bg-gray-400'
            )}
            style={{ width: `${row.progress}%` }}
          />
        </div>
        <p className="text-xs text-surface-500 mt-1">{row.progress}%</p>
      </div>
    )},
    { key: 'date', header: 'Created', render: (row: Task) => formatRelativeTime(row.created_at) },
    { key: 'actions', header: 'Actions', render: (row: Task) => (
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(`/tasks/${row.id}`)}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="View task details"
        >
          <Eye className="w-4 h-4" />
        </button>
        {row.status === 'completed' && row.output_filename && (
          <button
            onClick={async () => {
              try {
                const blob = await tasksApi.download(row.id, 'segmentation')
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `seg_${row.original_filename}`
                link.click()
                window.URL.revokeObjectURL(url)
              } catch (error) {
                toast.error('Download failed')
              }
            }}
            className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
            aria-label="Download segmentation"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
        {(row.status === 'pending' || row.status === 'queued') && (
          <button
            onClick={() => handleCancel(row.id)}
            className="p-2 rounded-lg text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            aria-label="Cancel task"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => handleDelete(row.id)}
          className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          aria-label="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Tasks</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">Manage your segmentation tasks</p>
        </div>
        <Button onClick={() => setShowUploadModal(true)}>
          <Upload className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search by filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="input w-auto"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value as ModelType | 'all')}
              className="input w-auto"
            >
              <option value="all">All Models</option>
              <option value="unet">U-Net</option>
              <option value="nnunet">nnU-Net</option>
              <option value="attention_unet">Attention U-Net</option>
              <option value="swin_unetr">Swin UNETR</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tasks table */}
      <Card>
        <CardContent className="p-0">
          <Table
            columns={columns}
            data={tasks}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            hoverable
            emptyMessage="No tasks found"
          />
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(total / pageSize)}
        onPageChange={setPage}
        showPageSize
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => { setShowUploadModal(false); reset(); setSelectedFile(null); setFileError(null); }}
        title="Create New Segmentation Task"
        size="lg"
      >
        <LoadingOverlay isLoading={uploading} message="Uploading and creating task...">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-8 text-center">
              <input
                type="file"
                id="file-upload"
                accept=".nii,.nii.gz,.dcm,.dicom,.mha,.mhd"
                onChange={onFileChange}
                className="hidden"
                disabled={uploading}
              />
              <label
                htmlFor="file-upload"
                className={cn(
                  'cursor-pointer flex flex-col items-center gap-3',
                  selectedFile && 'bg-primary-50 dark:bg-primary-900/20 border-primary-500',
                  fileError && 'border-red-500 bg-red-50 dark:bg-red-900/20'
                )}
              >
                <Upload className="w-12 h-12 text-surface-400 dark:text-surface-500" />
                <div>
                  <p className="text-surface-900 dark:text-white font-medium">
                    {selectedFile ? selectedFile.name : 'Drag & drop a medical image file'}
                  </p>
                  <p className="text-sm text-surface-500">
                    Supported: NIfTI (.nii, .nii.gz), DICOM (.dcm), MetaImage (.mha, .mhd)
                  </p>
                  <p className="text-xs text-surface-400">Max size: 500MB</p>
                </div>
              </label>
              {fileError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{fileError}</p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label">Model</label>
                <select
                  {...register('model_type')}
                  className="input"
                  disabled={uploading}
                >
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name} ({model.model_type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Model Version (optional)</label>
                <Input
                  placeholder="latest"
                  {...register('model_version')}
                  disabled={uploading}
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label">Modality (optional)</label>
                <select {...register('modality')} className="input" disabled={uploading}>
                  <option value="">Select modality</option>
                  {MEDICAL_MODALITIES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Body Part (optional)</label>
                <select {...register('body_part')} className="input" disabled={uploading}>
                  <option value="">Select body part</option>
                  {BODY_PARTS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Notes (optional)</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="input resize-y"
                placeholder="Any additional information about this scan..."
                disabled={uploading}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setShowUploadModal(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={uploading}>
                <Loader2 className="w-4 h-4" />
                {uploading ? `Uploading... ${uploadProgress}%` : 'Create Task'}
              </Button>
            </div>
          </form>
        </LoadingOverlay>
      </Modal>
    </div>
  )
}