import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { tasksApi } from '../../lib/api'
import { Task, TaskStatus } from '../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Table } from '../../components/ui/Table'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import {
  FileText,
  Cube,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Plus,
  ArrowRight,
} from 'lucide-react'
import { formatRelativeTime, getStatusColor, cn } from '../../lib/utils'

const statusIcons = {
  pending: Clock,
  queued: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: AlertCircle,
}

export function Dashboard() {
  const { user } = useAuth()
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    processing: 0,
    failed: 0,
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await tasksApi.list({ page_size: 5, page: 1 })
        setRecentTasks(response.data.tasks)
        setStats({
          total: response.data.total,
          completed: response.data.tasks.filter(t => t.status === 'completed').length,
          processing: response.data.tasks.filter(t => t.status === 'processing').length,
          failed: response.data.tasks.filter(t => t.status === 'failed').length,
        })
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  const statCards = [
    {
      name: 'Total Tasks',
      value: stats.total,
      icon: FileText,
      color: 'text-primary-600 dark:text-primary-400',
      bgColor: 'bg-primary-100 dark:bg-primary-900/30',
    },
    {
      name: 'Completed',
      value: stats.completed,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      name: 'Processing',
      value: stats.processing,
      icon: Loader2,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      name: 'Failed',
      value: stats.failed,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  ]

  const columns = [
    { key: 'filename', header: 'File', render: (row: Task) => (
      <div>
        <p className="font-medium">{row.original_filename}</p>
        <p className="text-xs text-surface-500">{row.modality || 'Unknown'} • {row.body_part || 'Unknown'}</p>
      </div>
    )},
    { key: 'model', header: 'Model', render: (row: Task) => (
      <span className="text-sm font-mono">{row.model_type.toUpperCase()}</span>
    )},
    { key: 'status', header: 'Status', render: (row: Task) => {
      const Icon = statusIcons[row.status as keyof typeof statusIcons] || Clock
      return (
        <Badge variant={getStatusColor(row.status).replace('badge-', '') as any}>
          <Icon className="w-3 h-3 mr-1" />
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </Badge>
      )
    }},
    { key: 'progress', header: 'Progress', render: (row: Task) => (
      <div className="w-32">
        <div className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-600 transition-all duration-300"
            style={{ width: `${row.progress}%` }}
          />
        </div>
        <p className="text-xs text-surface-500 mt-1">{row.progress}%</p>
      </div>
    )},
    { key: 'date', header: 'Created', render: (row: Task) => formatRelativeTime(row.created_at) },
    { key: 'actions', header: '', render: (row: Task) => (
      <Link
        to={`/tasks/${row.id}`}
        className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1"
      >
        View <ArrowRight className="w-4 h-4" />
      </Link>
    )},
  ]

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            Welcome back, {user?.full_name?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">
            Here&apos;s an overview of your segmentation tasks
          </p>
        </div>
        <Link to="/tasks" className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.name} className="hover:shadow-medical-lg transition-shadow">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', stat.bgColor)}>
                <stat.icon className={cn('w-6 h-6', stat.color)} />
              </div>
              <div>
                <p className="text-sm text-surface-600 dark:text-surface-400">{stat.name}</p>
                <p className="text-3xl font-bold text-surface-900 dark:text-white">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent tasks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Tasks</CardTitle>
              <CardDescription>Your 5 most recent segmentation tasks</CardDescription>
            </div>
            <Link to="/tasks" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse bg-surface-200 dark:bg-surface-700 rounded-lg" />
              ))}
            </div>
          ) : recentTasks.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-4" />
              <h3 className="text-lg font-medium text-surface-900 dark:text-white mb-2">No tasks yet</h3>
              <p className="text-surface-600 dark:text-surface-400 mb-4">Get started by uploading a medical image for segmentation</p>
              <Link to="/tasks" className="btn-primary inline-flex">
                <Plus className="w-4 h-4 mr-2" />
                Create your first task
              </Link>
            </div>
          ) : (
            <Table
              columns={columns}
              data={recentTasks}
              keyExtractor={(row) => row.id}
              isLoading={isLoading}
              hoverable
            />
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/tasks" className="card-hover p-6 text-center">
          <Cube className="w-10 h-10 mx-auto text-primary-600 dark:text-primary-400 mb-3" />
          <h3 className="font-semibold text-surface-900 dark:text-white mb-1">New Segmentation</h3>
          <p className="text-sm text-surface-600 dark:text-surface-400">Upload a medical image and run segmentation</p>
        </Link>
        <Link to="/models" className="card-hover p-6 text-center">
          <TrendingUp className="w-10 h-10 mx-auto text-green-600 dark:text-green-400 mb-3" />
          <h3 className="font-semibold text-surface-900 dark:text-white mb-1">Explore Models</h3>
          <p className="text-sm text-surface-600 dark:text-surface-400">View available segmentation models</p>
        </Link>
        <Link to="/profile" className="card-hover p-6 text-center">
          <FileText className="w-10 h-10 mx-auto text-blue-600 dark:text-blue-400 mb-3" />
          <h3 className="font-semibold text-surface-900 dark:text-white mb-1">My Profile</h3>
          <p className="text-sm text-surface-600 dark:text-surface-400">Manage your account settings</p>
        </Link>
      </div>
    </div>
  )
}