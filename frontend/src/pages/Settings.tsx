import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Loader2, Lock, Key, Moon, Sun, Monitor, Bell, Shield, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

type PasswordFormData = z.infer<typeof passwordSchema>

const notificationSchema = z.object({
  email_notifications: z.boolean(),
  task_completion: z.boolean(),
  task_failure: z.boolean(),
  weekly_digest: z.boolean(),
})

type NotificationFormData = z.infer<typeof notificationSchema>

export function Settings() {
  const { user, changePassword } = useAuth()
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'security' | 'notifications' | 'appearance' | 'danger'>('security')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const notificationForm = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      email_notifications: true,
      task_completion: true,
      task_failure: true,
      weekly_digest: false,
    },
  })

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setIsChangingPassword(true)
    try {
      await changePassword(data.current_password, data.new_password)
      toast.success('Password changed successfully')
      passwordForm.reset()
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to change password'
      toast.error(message)
    } finally {
      setIsChangingPassword(false)
    }
  }

  const onNotificationSubmit = async (data: NotificationFormData) => {
    try {
      // In a real app, this would call an API
      toast.success('Notification preferences saved')
    } catch (error) {
      toast.error('Failed to save preferences')
    }
  }

  const handleDeleteAccount = async () => {
    const confirm1 = window.confirm(
      'Are you sure you want to delete your account? This action is irreversible and will delete all your tasks and data.'
    )
    if (!confirm1) return

    const confirm2 = window.confirm(
      'This will permanently delete your account. Type "DELETE" in the next prompt to confirm.'
    )
    if (!confirm2) return

    const typed = window.prompt('Type "DELETE" to confirm account deletion:')
    if (typed !== 'DELETE') {
      toast.error('Confirmation text does not match')
      return
    }

    try {
      await api.delete('/auth/me')
      toast.success('Account deleted')
      // AuthContext will handle logout
    } catch (error) {
      toast.error('Failed to delete account')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Settings</h1>
        <p className="text-surface-600 dark:text-surface-400 mt-1">Manage your account settings and preferences</p>
      </div>

      {/* Tab navigation */}
      <Card>
        <CardContent className="p-1">
          <nav className="flex gap-1" role="tablist" aria-label="Settings tabs">
            {[
              { id: 'security', label: 'Security', icon: Lock },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'appearance', label: 'Appearance', icon: Monitor },
              { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  activeTab === id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
                )}
              >
                <icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </CardContent>
      </Card>

      {/* Security tab */}
      {activeTab === 'security' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Password
            </CardTitle>
            <CardDescription>Change your password. Your current password is required.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-5" noValidate>
              <Input
                label="Current Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                error={passwordForm.formState.errors.current_password?.message}
                {...passwordForm.register('current_password')}
              />

              <Input
                label="New Password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                error={passwordForm.formState.errors.new_password?.message}
                {...passwordForm.register('new_password')}
              />

              <Input
                label="Confirm New Password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                error={passwordForm.formState.errors.confirm_password?.message}
                {...passwordForm.register('confirm_password')}
              />

              <div className="rounded-lg bg-surface-50 dark:bg-surface-800/50 p-4 text-sm text-surface-600 dark:text-surface-400">
                <p className="font-medium mb-2">Password requirements:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>At least 12 characters</li>
                  <li>One uppercase letter (A-Z)</li>
                  <li>One lowercase letter (a-z)</li>
                  <li>One number (0-9)</li>
                  <li>One special character (!@#$%^&*)</li>
                </ul>
              </div>

              <div className="flex justify-end pt-4 border-t border-surface-200 dark:border-surface-700">
                <Button type="submit" loading={isChangingPassword}>
                  <Loader2 className="w-4 h-4 mr-2" />
                  Change Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Keys
            </CardTitle>
            <CardDescription>Manage API keys for programmatic access</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Key className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-4" />
              <h3 className="text-lg font-medium text-surface-900 dark:text-white mb-2">API Keys Coming Soon</h3>
              <p className="text-surface-600 dark:text-surface-400 mb-4">
                Programmatic access to the MedSeg API will be available in a future release.
              </p>
              <Button variant="outline" disabled>
                Generate API Key
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Choose what notifications you receive</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6" noValidate>
              <div className="space-y-4">
                {[
                  { name: 'email_notifications', label: 'Email Notifications', desc: 'Receive notifications via email' },
                  { name: 'task_completion', label: 'Task Completion', desc: 'Notify me when segmentation tasks complete' },
                  { name: 'task_failure', label: 'Task Failures', desc: 'Notify me when tasks fail' },
                  { name: 'weekly_digest', label: 'Weekly Digest', desc: 'Receive a weekly summary of your activity' },
                ].map(({ name, label, desc }) => (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={name}
                        className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                        {...notificationForm.register(name)}
                      />
                      <label htmlFor={name} className="cursor-pointer">
                        <p className="font-medium text-surface-900 dark:text-white">{label}</p>
                        <p className="text-sm text-surface-500 dark:text-surface-400">{desc}</p>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4 border-t border-surface-200 dark:border-surface-700">
                <Button type="submit">Save Preferences</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Appearance tab */}
      {activeTab === 'appearance' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize how MedSeg looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-medium text-surface-900 dark:text-white mb-4">Theme</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: 'light', label: 'Light', icon: Sun, desc: 'Always use light mode' },
                  { value: 'dark', label: 'Dark', icon: Moon, desc: 'Always use dark mode' },
                  { value: 'system', label: 'System', icon: Monitor, desc: 'Match system preference' },
                ].map(({ value, label, icon, desc }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value as any)}
                    className={cn(
                      'p-4 rounded-xl border-2 transition-all text-left',
                      theme === value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        theme === value ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400'
                      )}>
                        <icon className="w-5 h-5" />
                      </div>
                    </div>
                    <p className="font-medium text-surface-900 dark:text-white">{label}</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone tab */}
      {activeTab === 'danger' && (
        <Card className="border-red-200 dark:border-red-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible and destructive actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900/30">
                <h4 className="font-medium text-red-900 dark:text-red-100 mb-2">Delete Account</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                  All your segmentation tasks, uploaded files, and settings will be permanently removed.
                </p>
                <Button variant="danger" onClick={handleDeleteAccount}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}