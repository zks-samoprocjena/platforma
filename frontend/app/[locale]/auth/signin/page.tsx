'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useSearchParams, useRouter } from 'next/navigation'

export default function SignInPage() {
  const { login, isAuthenticated } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect') || '/dashboard'

  useEffect(() => {
    if (isAuthenticated) {
      // User is already authenticated, redirect them
      router.push(redirect)
    } else {
      // Trigger Keycloak login
      login()
    }
  }, [isAuthenticated, login, redirect, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg"></div>
        <p className="mt-4">Redirecting to login...</p>
      </div>
    </div>
  )
}