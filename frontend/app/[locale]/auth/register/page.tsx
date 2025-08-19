'use client'

import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function RegisterPage() {
  const { register } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Trigger Keycloak registration
    register()
  }, [register])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg"></div>
        <p className="mt-4">Redirecting to registration...</p>
      </div>
    </div>
  )
}