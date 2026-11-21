import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card'
import { Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type ForgotFormData = z.infer<typeof forgotSchema>

export function ForgotPassword() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (data: ForgotFormData) => {
    setIsSubmitting(true)
    try {
      await api.auth.forgotPassword(data.email)
      setSubmitted(true)
      toast.success('If the email exists, a reset link has been sent')
    } catch (error: any) {
      // Don't reveal if email exists
      setSubmitted(true)
      toast.success('If the email exists, a reset link has been sent')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card className="w-full shadow-medical-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>We&apos;ve sent a password reset link</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-surface-600 dark:text-surface-400 mb-6">
            If an account exists with that email, you&apos;ll receive a password reset link shortly.
          </p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <button onClick={() => setSubmitted(false)} className="text-primary-600 hover:underline">
              try again
            </button>
          </p>
          <Button variant="outline" onClick={() => setSubmitted(false)}>
            Back to form
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-center text-sm text-surface-600 dark:text-surface-400">
            Remember your password?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full shadow-medical-lg">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">Forgot password?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={isSubmitting}
          >
            <Loader2 className="w-4 h-4" aria-hidden="true" />
            Send reset link
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-center text-sm text-surface-600 dark:text-surface-400">
          Remember your password?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}