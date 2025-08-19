'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useRoles } from '@/hooks/useAuth'
import { OrganizationCheck } from '@/components/organization-check'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: string[]
  requireAnyRole?: boolean // If true, user needs at least one of the roles. If false, needs all roles.
  locale?: string
}

export function ProtectedRoute({
  children,
  requiredRoles = [],
  requireAnyRole = true,
  locale = 'hr',
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const { hasRole, hasAnyRole, hasAllRoles } = useRoles()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login if not authenticated
      router.push(`/${locale}/auth/signin?redirect=${window.location.pathname}`)
    } else if (!isLoading && isAuthenticated && requiredRoles.length > 0) {
      // Check role requirements
      const hasRequiredAccess = requireAnyRole
        ? hasAnyRole(requiredRoles)
        : hasAllRoles(requiredRoles)

      if (!hasRequiredAccess) {
        // Redirect to unauthorized page or dashboard
        router.push(`/${locale}/dashboard`)
      }
    }
  }, [
    isAuthenticated,
    isLoading,
    requiredRoles,
    requireAnyRole,
    hasAnyRole,
    hasAllRoles,
    router,
    locale,
  ])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render children until we've confirmed authentication
  if (!isAuthenticated) {
    return null
  }

  // Check roles if required
  if (requiredRoles.length > 0) {
    const hasRequiredAccess = requireAnyRole
      ? hasAnyRole(requiredRoles)
      : hasAllRoles(requiredRoles)

    if (!hasRequiredAccess) {
      return null
    }
  }

  return (
    <OrganizationCheck>
      {children}
    </OrganizationCheck>
  )
}