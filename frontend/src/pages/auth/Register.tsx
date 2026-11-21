import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card'
import { Loader2 } from 'lucide-react'

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(100),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  confirmPassword: z.string(),
  full_name: z.string().min(1, 'Full name is required').max(255),
  institution: z.string().max(255).optional(),
  department: z.string().max(255).optional(),
  orcid: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'Invalid ORCID format (XXXX-XXXX-XXXX-XXXX)')
    .optional()
    .or(z.literal('')),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type RegisterFormData = z.infer<typeof registerSchema>

export function Register() {
  const { register: registerUser, isLoading: authLoading } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const password = watch('password')

  const passwordStrength = React.useMemo(() => {
    if (!password) return 0
    let strength = 0
    if (password.length >= 12) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[a-z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[^A-Za-z0-9]/.test(password)) strength++
    return strength
  }, [password])

  const onSubmit = async (data: RegisterFormData) => {
    setIsSubmitting(true)
    try {
      await registerUser({
        email: data.email,
        username: data.username,
        password: data.password,
        full_name: data.full_name,
        institution: data.institution || undefined,
        department: data.department || undefined,
        orcid: data.orcid || undefined,
      })
      toast.success('Account created! Please check your email for verification.')
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Registration failed. Please try again.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full shadow-medical-lg">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">Create an account</CardTitle>
        <CardDescription>Join MedSeg for medical image segmentation</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              autoComplete="name"
              error={errors.full_name?.message}
              {...register('full_name')}
            />
            <Input
              label="Username"
              type="text"
              placeholder="johndoe"
              autoComplete="username"
              error={errors.username?.message}
              {...register('username')}
            />
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
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
            label="ORCID (optional)"
            type="text"
            placeholder="0000-0000-0000-0000"
            pattern="[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]"
            error={errors.orcid?.message}
            {...register('orcid')}
          />

          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-[38px] text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {password && (
              <div className="mt-2">
                <div className="flex gap-1 h-2" role="progressbar" aria-valuenow={passwordStrength} aria-valuemin={0} aria-valuemax={5}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded transition-colors"
                      style={{
                        backgroundColor: i < passwordStrength
                          ? passwordStrength <= 2 ? '#ef4444' : passwordStrength <= 3 ? '#f97316' : '#22c55e'
                          : '#e2e8f0',
                      }}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-surface-500">
                  {['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength - 1] || 'Very weak'}
                </p>
              </div>
            )}
          </div>

          <Input
            label="Confirm Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
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

          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={isSubmitting || authLoading}
          >
            <Loader2 className="w-4 h-4" aria-hidden="true" />
            Create account
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-4">
        <p className="text-center text-sm text-surface-600 dark:text-surface-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-surface-500 dark:text-surface-400">
          By creating an account, you agree to our{' '}
          <a href="#" className="underline hover:text-primary-600">Terms of Service</a>{' '}
          and{' '}
          <a href="#" className="underline hover:text-primary-600">Privacy Policy</a>
        </p>
      </CardFooter>
    </Card>
  )
}