import React, { useEffect, useState } from 'react'
import { adminApi } from '../../../lib/api'
import { UserAdminResponse, UserRole, UserStatus } from '../../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Table, Pagination } from '../../../components/ui/Table'
import { Modal } from '../../../components/ui/Modal'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import {
  Users,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Edit,
  Shield,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react'
import { cn, formatDate, getRoleColor, getStatusColor } from '../../../lib/utils'

const roleOptions: UserRole[] = ['admin', 'radiologist', 'researcher', 'viewer']
const statusOptions: UserStatus[] = ['active', 'inactive', 'locked', 'pending_verification']

const roleColors: Record<UserRole, string> = {
  admin: 'badge-danger',
  radiologist: 'badge-primary',
  researcher: 'badge-info',
  viewer: 'badge-secondary',
}

const statusColors: Record<UserStatus, string> = {
  active: 'badge-success',
  inactive: 'badge-secondary',
  locked: 'badge-danger',
  pending_verification: 'badge-warning',
}

export function AdminUsers() {
  const [users, setUsers] = useState<UserAdminResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState<UserAdminResponse | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('viewer')
  const [editStatus, setEditStatus] = useState<UserStatus>('active')

  useEffect(() => {
    fetchUsers()
  }, [page, pageSize, roleFilter, statusFilter, search])

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const response = await adminApi.listUsers({
        page,
        page_size: pageSize,
        role: roleFilter === 'all' ? undefined : roleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
      })
      setUsers(response.data)
      // Note: total would come from API response in real implementation
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, role: UserRole) => {
    try {
      await adminApi.updateUserRole(userId, role)
      fetchUsers()
    } catch (error) {
      alert('Failed to update role')
    }
  }

  const handleStatusChange = async (userId: string, status: UserStatus) => {
    try {
      await adminApi.updateUserStatus(userId, status)
      fetchUsers()
    } catch (error) {
      alert('Failed to update status')
    }
  }

  const openEditModal = (user: UserAdminResponse) => {
    setEditingUser(user)
    setEditRole(user.role as UserRole)
    setEditStatus(user.status as UserStatus)
  }

  const columns = [
    { key: 'user', header: 'User', render: (row: UserAdminResponse) => (
      <div className="min-w-[200px]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {row.full_name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <p className="font-medium text-surface-900 dark:text-white">{row.full_name}</p>
            <p className="text-xs text-surface-500">{row.email}</p>
          </div>
        </div>
      </div>
    )},
    { key: 'username', header: 'Username', render: (row: UserAdminResponse) => (
      <span className="font-mono text-sm text-surface-600 dark:text-surface-400">@{row.username}</span>
    )},
    { key: 'role', header: 'Role', render: (row: UserAdminResponse) => (
      <Badge variant={roleColors[row.role as UserRole] as any} className="gap-1">
        <Shield className="w-3 h-3" />
        {row.role.charAt(0).toUpperCase() + row.role.slice(1)}
      </Badge>
    )},
    { key: 'status', header: 'Status', render: (row: UserAdminResponse) => (
      <Badge variant={statusColors[row.status as UserStatus] as any} className="gap-1">
        {row.status === 'pending_verification' ? (
          <>
            <AlertTriangle className="w-3 h-3" />
            Pending Verification
          </>
        ) : row.status.charAt(0).toUpperCase() + row.status.slice(1).replace('_', ' ')}
      </Badge>
    )},
    { key: 'institution', header: 'Institution', render: (row: UserAdminResponse) => (
      <span className="text-surface-600 dark:text-surface-400">{row.institution || '—'}</span>
    )},
    { key: 'tasks', header: 'Tasks', render: (row: UserAdminResponse) => (
      <span className="font-mono text-surface-900 dark:text-white">{row.task_count}</span>
    )},
    { key: 'last_login', header: 'Last Login', render: (row: UserAdminResponse) => (
      <span className="text-surface-600 dark:text-surface-400">
        {row.last_login ? formatDate(row.last_login) : 'Never'}
      </span>
    )},
    { key: 'created', header: 'Created', render: (row: UserAdminResponse) => formatDate(row.created_at) },
    { key: 'actions', header: 'Actions', render: (row: UserAdminResponse) => (
      <div className="flex items-center gap-2">
        <button
          onClick={() => openEditModal(row)}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="Edit user"
        >
          <Edit className="w-4 h-4" />
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">User Management</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">Manage user accounts, roles, and permissions</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-10"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value as UserRole | 'all'); setPage(1); }}
              className="input w-auto"
            >
              <option value="all">All Roles</option>
              {roleOptions.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as UserStatus | 'all'); setPage(1); }}
              className="input w-auto"
            >
              <option value="all">All Status</option>
              {statusOptions.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          <Table
            columns={columns}
            data={users}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            hoverable
            emptyMessage="No users found"
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

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit User"
        size="md"
      >
        {editingUser && (
          <div className="space-y-4">
            <p className="text-sm text-surface-600 dark:text-surface-400">
              Editing <strong>{editingUser.full_name}</strong> ({editingUser.email})
            </p>
            <div>
              <label className="label">Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="input"
              >
                {roleOptions.map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as UserStatus)}
                className="input"
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-surface-200 dark:border-surface-700">
              <Button variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  handleRoleChange(editingUser.id, editRole)
                  handleStatusChange(editingUser.id, editStatus)
                  setEditingUser(null)
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}