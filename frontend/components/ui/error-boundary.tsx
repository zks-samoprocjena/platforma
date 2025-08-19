'use client'

import React, { Component, ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo })
    
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultErrorFallback 
        error={this.state.error}
        resetError={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
      />
    }

    return this.props.children
  }
}

interface ErrorFallbackProps {
  error?: Error
  resetError: () => void
}

function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const t = useTranslations('errors')

  const handleReload = () => {
    resetError()
    window.location.reload()
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="card bg-base-200 shadow-xl max-w-md">
        <div className="card-body text-center">
          <div className="text-error text-6xl mb-4">⚠️</div>
          <h2 className="card-title justify-center text-error mb-4">
            {t('title')}
          </h2>
          <p className="text-base-content/70 mb-6">
            {t('description')}
          </p>
          
          {process.env.NODE_ENV === 'development' && error && (
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-sm font-medium mb-2">
                {t('technicalDetails')}
              </summary>
              <div className="text-xs text-error bg-error/10 p-3 rounded border-l-4 border-error">
                <div className="font-mono whitespace-pre-wrap break-all">
                  {error.name}: {error.message}
                </div>
                {error.stack && (
                  <div className="mt-2 font-mono text-xs whitespace-pre-wrap break-all">
                    {error.stack}
                  </div>
                )}
              </div>
            </details>
          )}
          
          <div className="card-actions justify-center gap-2">
            <button 
              className="btn btn-primary btn-sm"
              onClick={resetError}
            >
              {t('tryAgain')}
            </button>
            <button 
              className="btn btn-outline btn-sm"
              onClick={handleReload}
            >
              {t('reloadPage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Custom hook for easier error handling
export function useErrorHandler() {
  return (error: Error, errorInfo?: React.ErrorInfo) => {
    console.error('Application error:', error, errorInfo)
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { extra: errorInfo })
    }
  }
}

// API Error component for network-related errors
export function APIErrorFallback({ 
  error, 
  retry, 
  className = '' 
}: { 
  error: string
  retry?: () => void
  className?: string 
}) {
  const t = useTranslations('errors.api')

  return (
    <div className={`card bg-warning/10 border border-warning/20 ${className}`}>
      <div className="card-body text-center">
        <div className="text-warning text-4xl mb-2">📡</div>
        <h3 className="font-semibold text-warning mb-2">
          {t('title')}
        </h3>
        <p className="text-sm text-base-content/70 mb-4">
          {error || t('description')}
        </p>
        {retry && (
          <button 
            className="btn btn-warning btn-sm"
            onClick={retry}
          >
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  )
}

export default ErrorBoundaryClass