'use client'

import React from 'react'
import { useTranslations } from 'next-intl'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback
      return (
        <FallbackComponent
          error={this.state.error!}
          reset={() => this.setState({ hasError: false, error: undefined })}
        />
      )
    }

    return this.props.children
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errors')

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-error/10 border border-error/20 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-error mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.694-.833-2.464 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h2 className="text-lg font-semibold text-error">{t('title')}</h2>
          </div>
          
          <p className="text-base-content/80 mb-4">
            {t('description')}
          </p>
          
          <details className="mb-4">
            <summary className="cursor-pointer text-sm text-base-content/60 hover:text-base-content">
              {t('technicalDetails')}
            </summary>
            <div className="mt-2 p-3 bg-base-200 rounded text-xs font-mono text-base-content/70">
              {error.message}
            </div>
          </details>
          
          <div className="flex gap-3">
            <button 
              onClick={reset}
              className="btn btn-primary btn-sm"
            >
              {t('tryAgain')}
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="btn btn-outline btn-sm"
            >
              {t('reloadPage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function APIErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary fallback={APIErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}

function APIErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errors.api')

  return (
    <div className="bg-error/10 border border-error/20 rounded-lg p-4 my-4">
      <div className="flex items-start">
        <svg className="w-5 h-5 text-error mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <h3 className="font-medium text-error mb-1">{t('title')}</h3>
          <p className="text-sm text-base-content/70 mb-3">{t('description')}</p>
          <button 
            onClick={reset}
            className="btn btn-error btn-xs"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    </div>
  )
}