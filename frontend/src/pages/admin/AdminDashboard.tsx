import React, { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import { SystemStats } from '../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import {
  Users,
  FileText,
  TrendingUp,
  Database,
  Cpu,
  Shield,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const statCards = [
  { name: 'Total Users', key: 'total_users', icon: Users, color: 'text-primary-600 dark:text-primary-400', bgColor: 'bg-primary-100 dark:bg-primary-900/30' },
  { name: 'Active Users', key: 'active_users', icon: Users, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  { name: 'Total Tasks', key: 'total_tasks', icon: FileText, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  { name: 'Tasks Today', key: 'tasks_today', icon: TrendingUp, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  { name: 'Storage (GB)', key: 'storage_used_gb', icon: Database, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  { name: 'API Keys', key: 'api_keys_active', icon: Shield, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-900/30' },
]

const statusColors: Record<string, string> = {
  pending: 'badge-warning',
  queued: 'badge-info',
  processing: 'badge-primary',
  completed: 'badge-success',
  failed: 'badge-danger',
  cancelled: 'badge-secondary',
}

export function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, healthRes] = await Promise.all([
          adminApi.getStats(),
          adminApi.getDetailedHealth(),
        ])
        setStats(statsRes.data)
        setHealth(healthRes.data)
      } catch (error) {
        console.error('Failed to fetch admin data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <LoadingSpinner size="lg" />
          <span className="text-surface-600 dark:text-surface-400">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-surface-600 dark:text-surface-400 mt-1">System overview and health monitoring</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((stat) => (
          <Card key={stat.key} className="hover:shadow-medical-lg transition-shadow">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', stat.bgColor)}>
                <stat.icon className={cn('w-6 h-6', stat.color)} />
              </div>
              <div>
                <p className="text-sm text-surface-600 dark:text-surface-400">{stat.name}</p>
                <p className="text-3xl font-bold text-surface-900 dark:text-white">
                  {stats ? stats[stat.key as keyof SystemStats] : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* System health */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              System Health
            </CardTitle>
            <CardDescription>Real-time system component status</CardDescription>
          </CardHeader>
          <CardContent>
            {health && (
              <div className="space-y-4">
                {[
                  { key: 'database', label: 'Database', icon: Database },
                  { key: 'redis', label: 'Redis Cache', icon: Cpu },
                  { key: 'celery', label: 'Task Queue', icon: Activity },
                  { key: 'gpu', label: 'GPU', icon: Cpu },
                ].map(({ key, label, icon }) => {
                  const status = health[key] === 'healthy' || (key === 'gpu' && health.gpu?.available)
                  return (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
                      <div className="flex items-center gap-3">
                        <icon className={cn('w-5 h-5', status ? 'text-green-500' : 'text-red-500')} />
                        <span className="font-medium text-surface-900 dark:text-white">{label}</span>
                      </div>
                      <Badge variant={status ? 'success' : 'danger'}>
                        {status ? 'Healthy' : 'Unhealthy'}
                      </Badge>
                    </div>
                  )
                })}
                {health.gpu && health.gpu.available && health.gpu.memory && (
                  <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                    <h4 className="font-medium text-surface-900 dark:text-white mb-3">GPU Memory</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="p-3 bg-surface-100 dark:bg-surface-800 rounded-lg">
                        <p className="text-surface-500">Total</p>
                        <p className="font-bold">{health.gpu.memory.total_gb} GB</p>
                      </div>
                      <div className="p-3 bg-surface-100 dark:bg-surface-800 rounded-lg">
                        <p className="text-surface-500">Allocated</p>
                        <p className="font-bold">{health.gpu.memory.allocated_gb} GB</p>
                      </div>
                      <div className="p-3 bg-surface-100 dark:bg-surface-800 rounded-lg">
                        <p className="text-surface-500">Cached</p>
                        <p className="font-bold">{health.gpu.memory.cached_gb} GB</p>
                      </div>
                    </div>
                  </div>
                )}
                {health.loaded_models && health.loaded_models.length > 0 && (
                  <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                    <h4 className="font-medium text-surface-900 dark:text-white mb-3">Loaded Models</h4>
                    <div className="flex flex-wrap gap-2">
                      {health.loaded_models.map((model: string) => (
                        <Badge key={model} variant="primary" className="text-xs">{model}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Tasks by Status
            </CardTitle>
            <CardDescription>Current distribution of segmentation tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {stats && (
              <div className="space-y-4">
                {Object.entries(stats.tasks_by_status).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant={statusColors[status] as any} className="w-24">
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Badge>
                      <span className="text-surface-600 dark:text-surface-400">{count} tasks</span>
                    </div>
                    <div className="w-48 h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.total_tasks > 0 ? (count / stats.total_tasks) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <a href="/admin/users" className="card-hover p-6 text-center">
              <Users className="w-10 h-10 mx-auto text-primary-600 dark:text-primary-400 mb-3" />
              <h3 className="font-semibold text-surface-900 dark:text-white mb-1">User Management</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400">Manage users, roles, and permissions</p>
            </a>
            <a href="/admin/tasks" className="card-hover p-6 text-center">
              <FileText className="w-10 h-10 mx-auto text-green-600 dark:text-green-400 mb-3" />
              <h3 className="font-semibold text-surface-900 dark:text-white mb-1">All Tasks</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400">View and manage all segmentation tasks</p>
            </a>
            <a href="/admin/models" className="card-hover p-6 text-center">
              <Cpu className="w-10 h-10 mx-auto text-blue-600 dark:text-blue-400 mb-3" />
              <h3 className="font-semibold text-surface-900 dark:text-white mb-1">Model Registry</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400">Register and manage ML models</p>
            </a>
            <a href="/admin/audit-logs" className="card-hover p-6 text-center">
              <Shield className="w-10 h-10 mx-auto text-purple-600 dark:text-purple-400 mb-3" />
              <h3 className="font-semibold text-surface-900 dark:text-white mb-1">Audit Logs</h3>
              <p className="text-sm text-surface-600 dark:text-surface-400">Review system audit trail</p>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}