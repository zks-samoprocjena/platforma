'use client'

import { useEffect } from 'react'
import { useAuth, useUser } from '@/hooks/useAuth'
import { authErrorLogger, checkAuthenticationState } from '@/lib/auth-error-logger'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { performCompleteLogout } from '@/lib/logout-helper'

interface AuthErrorBoundaryProps {
  children: React.ReactNode
}

export function AuthErrorBoundary({ children }: AuthErrorBoundaryProps) {
  const { isAuthenticated } = useAuth()
  const user = useUser()
  
  useEffect(() => {
    // Check auth state on mount and when auth changes
    if (isAuthenticated) {
      const isValid = checkAuthenticationState(isAuthenticated, user)
      
      if (!isValid) {
        // Log the error state
        authErrorLogger.checkAuthState()
      }
    }
  }, [isAuthenticated, user])
  
  // If authenticated but no user data, show error state
  if (isAuthenticated && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-96 bg-error/10 shadow-xl border-2 border-error">
          <div className="card-body text-center">
            <ExclamationTriangleIcon className="h-16 w-16 text-error mx-auto mb-4" />
            <h2 className="card-title text-error justify-center">Authentication Error</h2>
            <p className="text-base-content/80 mb-4">
              Your session appears to be corrupted. No user data could be loaded.
            </p>
            <div className="text-sm text-base-content/60 mb-6">
              <p>This can happen when:</p>
              <ul className="list-disc list-inside mt-2 text-left">
                <li>Your session has expired</li>
                <li>Authentication tokens are corrupted</li>
                <li>There was a server communication error</li>
              </ul>
            </div>
            <div className="card-actions justify-center">
              <button
                onClick={() => {
                  const locale = window.location.pathname.split('/')[1] || 'hr'
                  performCompleteLogout(locale)
                }}
                className="btn btn-error"
              >
                Logout and Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // If authenticated and user exists but missing critical data
  if (isAuthenticated && user && (!user.email || !user.id)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-96 bg-warning/10 shadow-xl border-2 border-warning">
          <div className="card-body text-center">
            <ExclamationTriangleIcon className="h-16 w-16 text-warning mx-auto mb-4" />
            <h2 className="card-title text-warning justify-center">Incomplete User Data</h2>
            <p className="text-base-content/80 mb-4">
              Your user profile is missing required information.
            </p>
            <div className="text-sm text-base-content/60 mb-6">
              <p className="font-semibold mb-2">Missing fields:</p>
              <ul className="list-disc list-inside text-left">
                {!user.id && <li>User ID</li>}
                {!user.email && <li>Email address</li>}
                {!user.name && <li>Display name</li>}
              </ul>
            </div>
            <div className="card-actions justify-center">
              <button
                onClick={() => {
                  const locale = window.location.pathname.split('/')[1] || 'hr'
                  performCompleteLogout(locale)
                }}
                className="btn btn-warning"
              >
                Re-authenticate
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}