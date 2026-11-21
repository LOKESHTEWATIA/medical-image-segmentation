import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../lib/api'
import { Task, TaskStatus } from '../../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Table, Pagination } from '../../../components/ui/Table'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Eye,
  Download,
  Trash2,
  User,
  FileText,
  Cube,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react'
import { cn, formatRelativeTime, formatFileSize, getStatusColor } from '../../../lib/utils'
import { statusIcons } from '../../Dashboard'

const statusColors: Record<TaskStatus, string> = {
  pending: 'badge-warning',
  queued: 'badge-info',
  processing: 'badge-primary',
  completed: 'badge-success',
  failed: 'badge-danger',
  cancelled: 'badge-secondary',
}

export function AdminTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [userIdFilter, setUserIdFilter] = useState('')

  useEffect(() => {
    fetchTasks()
  }, [page, pageSize, statusFilter, userIdFilter])

  const fetchTasks = async () => {
    setIsLoading(true)
    try {
      const response = await adminApi.getAllTasks({
        page,
        page_size: pageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
        user_id: userIdFilter || undefined,
      })
      setTasks(response.data)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) return

    try {
      // In a real app, this would call an admin delete endpoint
      alert('Admin delete endpoint not implemented in demo')
    } catch (error) {
      alert('Failed to delete task')
    }
  }

  const columns = [
    { key: 'user', header: 'User', render: (row: Task) => (
      <div className="flex items-center gap-2 min-w-[180px]">
        <User className="w-4 h-4 text-surface-400" />
        <div>
          <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{row.user_email || row.user_id}</p>
          <p className="text-xs text-surface-500">@{row.user_username}</p>
        </div>
      </div>
    )},
    { key: 'filename', header: 'File', render: (row: Task) => (
      <div className="min-w-[200px]">
        <p className="font-medium truncate" title={row.original_filename}>{row.original_filename}</p>
        <p className="text-xs text-surface-500">{formatFileSize(row.file_size)}</p>
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
    { key: 'created', header: 'Created', render: (row: Task) => formatRelativeTime(row.created_at) },
    { key: 'completed', header: 'Completed', render: (row: Task) => (
      row.completed_at ? formatRelativeTime(row.completed_at) : '—'
    )},
    { key: 'actions', header: 'Actions', render: (row: Task) => (
      <div className="flex items-center gap-2">
        <button
          onClick={() => alert(`View task ${row.id}`)}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="View task details"
        >
          <Eye className="w-4 h-4" />
        </button>
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
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">All Tasks</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">View and manage all segmentation tasks across users</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Filter by user ID..."
              value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
              className="input pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as TaskStatus | 'all'); setPage(1); }}
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
        totalPages={Math.ceil(total / pageSize) || 1}
        onPageChange={setPage}
        showPageSize
        pageSize={pageSize}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
    </div>
  )
}