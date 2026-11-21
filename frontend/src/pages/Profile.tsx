import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Loader2, User, Mail, Building, Briefcase, Award, Shield } from 'lucide-react'
import { cn, getRoleColor } from '../../lib/utils'

const profileSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255),
  institution: z.string().max(255).optional(),
  department: z.string().max(255).optional(),
  orcid: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Invalid ORCID format (XXXX-XXXX-XXXX-XXXX)')
    .optional()
    .or(z.literal('')),
})

type ProfileFormData = z.infer<typeof profileSchema>

export function Profile() {
  const { user, updateProfile, isLoading: authLoading } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: user?.full_name || '',
      institution: user?.institution || '',
      department: user?.department || '',
      orcid: user?.orcid || '',
    },
  })

  const onSubmit = async (data: ProfileFormData) => {
    setIsSubmitting(true)
    try {
      await updateProfile(data)
      toast.success('Profile updated successfully')
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to update profile'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Profile</h1>
        <p className="text-surface-600 dark:text-surface-400 mt-1">Manage your account information</p>
      </div>

      {/* Profile header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <span className="text-3xl font-bold text-primary-700 dark:text-primary-300">
                {user?.full_name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-surface-900 dark:text-white">{user?.full_name}</h2>
              <p className="text-surface-600 dark:text-surface-400">{user?.email}</p>
              <div className="flex items-center gap-3 mt-3">
                <Badge variant={getRoleColor(user?.role || '').replace('badge-', '') as any} className="gap-1">
                  <Shield className="w-3 h-3" />
                  {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {user?.status?.charAt(0).toUpperCase() + user?.status?.slice(1).replace('_', ' ')}
                </Badge>
              </div>
            </div>
            <div className="text-right text-sm text-surface-500">
              <p>Member since</p>
              <p className="font-medium text-surface-900 dark:text-white">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile form */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your profile details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              label="Full Name"
              type="text"
              error={errors.full_name?.message}
              {...register('full_name')}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Institution"
                type="text"
                placeholder="University Hospital"
                error={errors.institution?.message}
                {...register('institution')}
              />
              <Input
                label="Department"
                type="text"
                placeholder="Radiology"
                error={errors.department?.message}
                {...register('department')}
              />
            </div>

            <Input
              label="ORCID"
              type="text"
              placeholder="0000-0000-0000-0000"
              pattern="[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]"
              error={errors.orcid?.message}
              {...register('orcid')}
            />

            <div className="flex justify-end pt-4 border-t border-surface-200 dark:border-surface-700">
              <Button type="submit" loading={isSubmitting || authLoading}>
                <Loader2 className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Read-only account details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-surface-500 dark:text-surface-400">Username</dt>
                <dd className="font-mono text-surface-900 dark:text-white">{user?.username}</dd>
              </div>
              <div>
                <dt className="text-sm text-surface-500 dark:text-surface-400">User ID</dt>
                <dd className="font-mono text-surface-900 dark:text-white truncate">{user?.id}</dd>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-surface-500 dark:text-surface-400">Role</dt>
                <dd className="text-surface-900 dark:text-white capitalize">{user?.role}</dd>
              </div>
              <div>
                <dt className="text-sm text-surface-500 dark:text-surface-400">Status</dt>
                <dd className="text-surface-900 dark:text-white capitalize">{user?.status?.replace('_', ' ')}</dd>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-surface-500 dark:text-surface-400">Last Login</dt>
                <dd className="text-surface-900 dark:text-white">
                  {user?.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-surface-500 dark:text-surface-400">MFA Enabled</dt>
                <dd className="text-surface-900 dark:text-white">{user?.mfa_enabled ? 'Yes' : 'No'}</dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}