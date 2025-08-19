'use client'

import { useRoles } from '@/hooks/useAuth'
import { ReactNode } from 'react'

interface RoleGuardProps {
  children: ReactNode
  roles: string[]
  requireAll?: boolean
  fallback?: ReactNode
}

export function RoleGuard({ 
  children, 
  roles, 
  requireAll = false,
  fallback = null 
}: RoleGuardProps) {
  const { hasAnyRole, hasAllRoles } = useRoles()
  
  // Guard against undefined or empty roles
  if (!roles || roles.length === 0) {
    return <>{fallback}</>
  }
  
  const hasAccess = requireAll 
    ? hasAllRoles(roles)
    : hasAnyRole(roles)
    
  if (!hasAccess) {
    return <>{fallback}</>
  }
  
  return <>{children}</>
}