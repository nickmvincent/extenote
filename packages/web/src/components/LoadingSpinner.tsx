import { ReactNode } from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  children?: ReactNode
}

export function LoadingSpinner({ size = 'md', message, children }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg
        className={`animate-spin text-indigo-600 dark:text-indigo-400 ${sizeClasses[size]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message && (
        <span className="text-sm text-gray-500 dark:text-gray-400">{message}</span>
      )}
      {children}
    </div>
  )
}

interface LoadingOverlayProps {
  message?: string
  progress?: { current: number; total: number }
}

export function LoadingOverlay({ message, progress }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          {message && (
            <p className="text-gray-700 dark:text-gray-300 text-center">{message}</p>
          )}
          {progress && (
            <div className="w-full">
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                <span>Progress</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface LoadingContainerProps {
  loading: boolean
  message?: string
  children: ReactNode
  minHeight?: string
}

export function LoadingContainer({ loading, message, children, minHeight = 'h-64' }: LoadingContainerProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center ${minHeight}`}>
        <LoadingSpinner message={message} />
      </div>
    )
  }

  return <>{children}</>
}
