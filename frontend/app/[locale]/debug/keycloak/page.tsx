'use client'

import { useAuth, useUser, useRoles } from '@/hooks/useAuth'
import { useKeycloakContext } from '@/lib/keycloak-provider'
import { useState, useEffect } from 'react'

export default function KeycloakDebugPage() {
  const { keycloak, initialized, isAuthenticated: contextAuth } = useKeycloakContext()
  const { isAuthenticated, isLoading, login, logout } = useAuth()
  const user = useUser()
  const { roles, isAdmin, isAssessmentEditor, isAssessmentViewer } = useRoles()
  const [keycloakState, setKeycloakState] = useState<any>({})

  useEffect(() => {
    if (keycloak) {
      setKeycloakState({
        authenticated: keycloak.authenticated,
        token: keycloak.token ? 'Present' : 'Missing',
        refreshToken: keycloak.refreshToken ? 'Present' : 'Missing',
        idToken: keycloak.idToken ? 'Present' : 'Missing',
        tokenParsed: keycloak.tokenParsed,
        idTokenParsed: keycloak.idTokenParsed,
        realmAccess: keycloak.realmAccess,
        resourceAccess: keycloak.resourceAccess,
        timeSkew: keycloak.timeSkew,
      })
    }
  }, [keycloak])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Keycloak Debug Information</h1>
      
      <div className="space-y-6">
        {/* Context State */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Context State</h2>
            <div className="space-y-2">
              <div>Initialized: {String(initialized)}</div>
              <div>Context Authenticated: {String(contextAuth)}</div>
              <div>Keycloak Instance: {keycloak ? 'Present' : 'Missing'}</div>
            </div>
          </div>
        </div>

        {/* Auth Hook State */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Auth Hook State</h2>
            <div className="space-y-2">
              <div>Is Authenticated: {String(isAuthenticated)}</div>
              <div>Is Loading: {String(isLoading)}</div>
            </div>
            <div className="card-actions justify-end mt-4">
              {isAuthenticated ? (
                <button className="btn btn-error" onClick={() => logout()}>
                  Logout
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => login()}>
                  Login
                </button>
              )}
            </div>
          </div>
        </div>

        {/* User Information */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">User Information</h2>
            {user ? (
              <div className="space-y-2">
                <div>ID: {user.id}</div>
                <div>Email: {user.email || 'N/A'}</div>
                <div>Name: {user.name || 'N/A'}</div>
                <div>Organization ID: {user.organizationId || 'N/A'}</div>
                <div>Organization Name: {user.organizationName || 'N/A'}</div>
                <div>Roles: {user.roles.join(', ') || 'None'}</div>
              </div>
            ) : (
              <div>No user information available</div>
            )}
          </div>
        </div>

        {/* Role Information */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Role Information</h2>
            <div className="space-y-2">
              <div>Is Admin: {String(isAdmin)}</div>
              <div>Is Assessment Editor: {String(isAssessmentEditor)}</div>
              <div>Is Assessment Viewer: {String(isAssessmentViewer)}</div>
              <div>All Roles: {roles.join(', ') || 'None'}</div>
            </div>
          </div>
        </div>

        {/* Keycloak State */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Keycloak Internal State</h2>
            <pre className="text-xs overflow-auto bg-base-200 p-4 rounded">
              {JSON.stringify(keycloakState, null, 2)}
            </pre>
          </div>
        </div>

        {/* Environment Variables */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Environment Variables</h2>
            <div className="space-y-2">
              <div>KEYCLOAK_URL: {process.env.NEXT_PUBLIC_KEYCLOAK_URL}</div>
              <div>KEYCLOAK_REALM: {process.env.NEXT_PUBLIC_KEYCLOAK_REALM}</div>
              <div>KEYCLOAK_CLIENT_ID: {process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}</div>
            </div>
          </div>
        </div>

        {/* Cookies */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Cookies</h2>
            <div className="space-y-2">
              <div>keycloak-token: {document.cookie.includes('keycloak-token') ? 'Present' : 'Missing'}</div>
              <div>keycloak-refresh-token: {document.cookie.includes('keycloak-refresh-token') ? 'Present' : 'Missing'}</div>
              <div>keycloak-id-token: {document.cookie.includes('keycloak-id-token') ? 'Present' : 'Missing'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}