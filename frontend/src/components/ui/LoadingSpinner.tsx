import React from 'react'
import { cn } from '../lib/utils'

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'primary' | 'white'
}

export const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ className, size = 'md', variant = 'primary', ...props }, ref) => {
    const sizeClasses = {
      sm: 'w-4 h-4 border-2',
      md: 'w-6 h-6 border-2',
      lg: 'w-8 h-8 border-3',
      xl: 'w-12 h-12 border-4',
    }

    const variantClasses = {
      primary: 'border-primary-600 border-t-transparent',
      white: 'border-white border-t-transparent',
    }

    return (
      <div
        ref={ref}
        className={cn('inline-block animate-spin rounded-full', sizeClasses[size], variantClasses[variant], className)}
        role="status"
        aria-label="Loading"
        {...props}
      >
        <span className="sr-only">Loading...</span>
      </div>
    )
  }
)

LoadingSpinner.displayName = 'LoadingSpinner'

export const LoadingOverlay = ({ children, isLoading, message }: {
  children: React.ReactNode
  isLoading: boolean
  message?: string
}) => {
  if (!isLoading) return <>{children}</>

  return (
    <div className="relative">
      {children}
      <div className="absolute inset-0 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="lg" />
          {message && <p className="text-sm text-surface-600 dark:text-surface-400">{message}</p>}
        </div>
      </div>
    </div>
  )
}