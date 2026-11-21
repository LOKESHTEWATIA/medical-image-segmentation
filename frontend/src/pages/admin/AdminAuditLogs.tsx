import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../lib/api'
import { AuditLog } from '../../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Table, Pagination } from '../../../components/ui/Table'
import { Modal } from '../../../components/ui/Modal'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Eye,
  Database,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  Shield,
  Download,
} from 'lucide-react'
import { cn, formatDate, formatRelativeTime } from '../../../lib/utils'

const categoryColors: Record<string, string> = {
  auth: 'badge-primary',
  data: 'badge-green',
  model: 'badge-blue',
  admin: 'badge-purple',
  system: 'badge-gray',
}

export function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [userIdFilter, setUserIdFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [successFilter, setSuccessFilter] = useState<'all' | 'true' | 'false'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    fetchLogs()
  }, [page, pageSize, userIdFilter, eventTypeFilter, categoryFilter, successFilter, startDate, endDate])

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const response = await adminApi.getAuditLogs({
        page,
        page_size: pageSize,
        user_id: userIdFilter || undefined,
        event_type: eventTypeFilter || undefined,
        event_category: categoryFilter || undefined,
        success: successFilter === 'all' ? undefined : successFilter === 'true',
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      })
      setLogs(response.data)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getCategoryColor = (category: string): string => {
    return categoryColors[category] || 'badge-secondary'
  }

  const getSuccessBadge = (success: boolean) => (
    <Badge variant={success ? 'success' : 'danger'} className="gap-1">
      {success ? (
        <>
          <CheckCircle className="w-3 h-3" />
          Success
        </>
      ) : (
        <>
          <AlertCircle className="w-3 h-3" />
          Failed
        </>
      )}
    </Badge>
  )

  const columns = [
    { key: 'timestamp', header: 'Time', render: (row: AuditLog) => (
      <span className="font-mono text-sm text-surface-600 dark:text-surface-400 whitespace-nowrap">
        {formatRelativeTime(row.created_at)}
      </span>
    )},
    { key: 'user', header: 'User', render: (row: AuditLog) => (
      <div className="flex items-center gap-2">
        {row.user_id ? (
          <>
            <User className="w-4 h-4 text-surface-400" />
            <span className="text-sm font-mono text-surface-600 dark:text-surface-400 max-w-[150px] truncate">
              {row.user_id.slice(0, 8)}...
            </span>
          </>
        ) : (
          <span className="text-sm text-surface-500 italic">System</span>
        )}
      </div>
    )},
    { key: 'category', header: 'Category', render: (row: AuditLog) => (
      <Badge variant={getCategoryColor(row.event_category) as any} className="text-xs capitalize">
        {row.event_category}
      </Badge>
    )},
    { key: 'event', header: 'Event', render: (row: AuditLog) => (
      <span className="text-sm font-medium text-surface-900 dark:text-white">{row.event_type}</span>
    )},
    { key: 'description', header: 'Description', render: (row: AuditLog) => (
      <span className="text-sm text-surface-600 dark:text-surface-400 max-w-[300px] truncate" title={row.description}>
        {row.description}
      </span>
    )},
    { key: 'resource', header: 'Resource', render: (row: AuditLog) => (
      <div className="flex items-center gap-1 text-sm text-surface-500">
        {row.resource_type && (
          <span className="font-mono bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded">
            {row.resource_type}
          </span>
        )}
        {row.resource_id && (
          <span className="font-mono text-surface-600 dark:text-surface-400 max-w-[100px] truncate">
            {row.resource_id.slice(0, 12)}...
          </span>
        )}
      </div>
    )},
    { key: 'success', header: 'Status', render: (row: AuditLog) => getSuccessBadge(row.success) },
    { key: 'ip', header: 'IP Address', render: (row: AuditLog) => (
      <span className="font-mono text-sm text-surface-600 dark:text-surface-400">{row.ip_address || '—'}</span>
    )},
    { key: 'actions', header: 'Actions', render: (row: AuditLog) => (
      <button
        onClick={() => setSelectedLog(row)}
        className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
        aria-label="View details"
      >
        <Eye className="w-4 h-4" />
      </button>
    )},
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Audit Logs</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">System audit trail for compliance and security monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Event type..."
              value={eventTypeFilter}
              onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }}
              className="input pl-10"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="input"
          >
            <option value="">All Categories</option>
            <option value="auth">Authentication</option>
            <option value="data">Data</option>
            <option value="model">Model</option>
            <option value="admin">Admin</option>
            <option value="system">System</option>
          </select>
          <select
            value={successFilter}
            onChange={(e) => { setSuccessFilter(e.target.value as any); setPage(1); }}
            className="input"
          >
            <option value="all">All Results</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
          <Input
            type="date"
            label="Start Date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="w-full"
          />
          <Input
            type="date"
            label="End Date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="w-full"
          />
          <Input
            label="User ID"
            placeholder="Filter by user..."
            value={userIdFilter}
            onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
            className="w-full"
          />
        </div>
      </Card>

      {/* Logs table */}
      <Card>
        <CardContent className="p-0">
          <Table
            columns={columns}
            data={logs}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            hoverable
            emptyMessage="No audit logs found"
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

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Details"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-surface-500">Event ID</dt>
                <dd className="font-mono text-surface-900 dark:text-white break-all">{selectedLog.id}</dd>
              </div>
              <div>
                <dt className="text-surface-500">Request ID</dt>
                <dd className="font-mono text-surface-900 dark:text-white">{selectedLog.request_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-surface-500">Timestamp</dt>
                <dd className="text-surface-900 dark:text-white">{formatDate(selectedLog.created_at)}</dd>
              </div>
              <div>
                <dt className="text-surface-500">Relative</dt>
                <dd className="text-surface-600 dark:text-surface-400">{formatRelativeTime(selectedLog.created_at)}</dd>
              </div>
              <div>
                <dt className="text-surface-500">Category</dt>
                <dd>
                  <Badge variant={getCategoryColor(selectedLog.event_category) as any} className="capitalize">
                    {selectedLog.event_category}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-surface-500">Event Type</dt>
                <dd className="font-medium text-surface-900 dark:text-white">{selectedLog.event_type}</dd>
              </div>
              <div>
                <dt className="text-surface-500">Success</dt>
                <dd>{getSuccessBadge(selectedLog.success)}</dd>
              </div>
              <div>
                <dt className="text-surface-500">User</dt>
                <dd className="font-mono text-surface-600 dark:text-surface-400">{selectedLog.user_id || 'System'}</dd>
              </div>
              <div>
                <dt className="text-surface-500">IP Address</dt>
                <dd className="font-mono text-surface-600 dark:text-surface-400">{selectedLog.ip_address || '—'}</dd>
              </div>
              <div>
                <dt className="text-surface-500">Resource</dt>
                <dd className="font-mono text-surface-600 dark:text-surface-400">
                  {selectedLog.resource_type || '—'} / {selectedLog.resource_id || '—'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-surface-500">Description</dt>
                <dd className="text-surface-900 dark:text-white whitespace-pre-wrap">{selectedLog.description}</dd>
              </div>
              {selectedLog.error_code && (
                <div className="col-span-2">
                  <dt className="text-surface-500">Error Code</dt>
                  <dd className="font-mono text-red-600 dark:text-red-400">{selectedLog.error_code}</dd>
                </div>
              )}
              {selectedLog.error_message && (
                <div className="col-span-2">
                  <dt className="text-surface-500">Error Message</dt>
                  <dd className="text-red-600 dark:text-red-400 whitespace-pre-wrap">{selectedLog.error_message}</dd>
                </div>
              )}
              {selectedLog.extra_data && (
                <div className="col-span-2">
                  <dt className="text-surface-500">Extra Data</dt>
                  <dd>
                    <pre className="text-xs text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 p-3 rounded-lg overflow-x-auto max-h-64 whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.extra_data, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
              {selectedLog.user_agent && (
                <div className="col-span-2">
                  <dt className="text-surface-500">User Agent</dt>
                  <dd className="font-mono text-xs text-surface-500 truncate max-w-full">{selectedLog.user_agent}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  )
}