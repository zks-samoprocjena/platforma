'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useKeycloakContext } from '@/lib/keycloak-provider'
import { performCompleteLogout } from '@/lib/logout-helper'
import { authErrorLogger } from '@/lib/auth-error-logger'
import type { KeycloakTokenParsed } from 'keycloak-js'

interface UserInfo {
  id: string
  email?: string
  name?: string
  roles: string[]
  organizationId?: string
  organizationName?: string
}

interface CustomTokenParsed extends KeycloakTokenParsed {
  realm_access?: {
    roles: string[]
  }
  resource_access?: {
    [key: string]: {
      roles: string[]
    }
  }
  organization_id?: string
  organization_name?: string
  [key: string]: any // Allow any additional properties
}

// Compatibility layer for components using useKeycloak
export function useKeycloak() {
  const { keycloak, initialized } = useKeycloakContext()
  return { keycloak, initialized }
}

export function useAuth() {
  const { keycloak, initialized, isAuthenticated } = useKeycloakContext()
  const router = useRouter()

  const login = useCallback(() => {
    if (keycloak) {
      keycloak.login()
    }
  }, [keycloak])

  const register = useCallback(() => {
    if (keycloak) {
      keycloak.register()
    }
  }, [keycloak])

  const logout = useCallback(() => {
    // Get the current locale from URL
    const currentPath = window.location.pathname;
    const locale = currentPath.split('/')[1] || 'hr';
    
    // Perform complete logout with all cleanup
    performCompleteLogout(locale);
  }, [])

  return {
    isAuthenticated,
    isLoading: !initialized,
    login,
    register,
    logout,
    keycloak,
  }
}

export function useUser(): UserInfo | null {
  const { keycloak } = useKeycloakContext()

  return useMemo(() => {
    if (!keycloak?.authenticated || !keycloak.tokenParsed) {
      return null
    }

    const token = keycloak.tokenParsed as CustomTokenParsed
    const idToken = keycloak.idTokenParsed as CustomTokenParsed

    // Check for critical token issues
    if (!token.sub) {
      authErrorLogger.logError(
        'INVALID_TOKEN',
        'Token is missing subject (sub) claim',
        { token, authenticated: keycloak.authenticated }
      )
      return null
    }

    const realmRoles = token.realm_access?.roles || []
    const clientRoles = token.resource_access?.[keycloak.clientId!]?.roles || []
    const allRoles = realmRoles.concat(clientRoles).filter((role, index, arr) => arr.indexOf(role) === index)

    // Get organization info from token
    const organizationId = token.organization_id || idToken?.organization_id || 
                          token['organization_id'] || idToken?.['organization_id']
    const organizationName = token.organization_name || idToken?.organization_name ||
                            token['organization_name'] || idToken?.['organization_name']
    
    const userInfo: UserInfo = {
      id: token.sub,
      email: token.email,
      name: token.name || token.preferred_username,
      roles: allRoles,
      organizationId,
      organizationName,
    }
    
    // Validate required fields
    if (!userInfo.email && !userInfo.name) {
      authErrorLogger.logError(
        'MISSING_USER_DATA',
        'User info is missing both email and name',
        { userInfo, token }
      )
    }
    
    return userInfo
  }, [keycloak])
}

export function useOrganization() {
  const user = useUser()
  
  return {
    organizationId: user?.organizationId,
    organizationName: user?.organizationName,
  }
}

export function useRoles() {
  const user = useUser()

  const hasRole = useCallback(
    (role: string): boolean => {
      return user?.roles.includes(role) || false
    },
    [user]
  )

  const hasAnyRole = useCallback(
    (roles: string[]): boolean => {
      if (!roles || !Array.isArray(roles)) return false
      return roles.some((role) => hasRole(role))
    },
    [hasRole]
  )

  const hasAllRoles = useCallback(
    (roles: string[]): boolean => {
      if (!roles || !Array.isArray(roles)) return false
      return roles.every((role) => hasRole(role))
    },
    [hasRole]
  )

  return {
    roles: user?.roles || [],
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isAdmin: hasRole('admin'),
    isAssessmentEditor: hasRole('assessment_editor'),
    isAssessmentViewer: hasRole('assessment_viewer'),
  }
}