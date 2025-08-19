'use client'

import { useKeycloak, useUser, useOrganization } from '@/hooks/useAuth'
import { useState } from 'react'

export default function DebugPage() {
  const { keycloak } = useKeycloak()
  const user = useUser()
  const organization = useOrganization()
  const [showRawToken, setShowRawToken] = useState(false)

  if (!keycloak?.authenticated) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Debug - Not Authenticated</h1>
        <p>Please login to see token information</p>
      </div>
    )
  }

  // Decode tokens manually for display
  const decodeToken = (token: string) => {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      
      const payload = parts[1]
      const padding = 4 - payload.length % 4
      const paddedPayload = payload + (padding !== 4 ? '='.repeat(padding) : '')
      return JSON.parse(atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/')))
    } catch (e) {
      return null
    }
  }

  const accessTokenDecoded = keycloak.token ? decodeToken(keycloak.token) : null
  const idTokenDecoded = keycloak.idToken ? decodeToken(keycloak.idToken) : null

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Keycloak Token Debug</h1>
      
      <div className="mb-8 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold mb-2">User Hook Result</h2>
        <pre className="text-sm overflow-auto">{JSON.stringify(user, null, 2)}</pre>
      </div>

      <div className="mb-8 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Organization Hook Result</h2>
        <pre className="text-sm overflow-auto">{JSON.stringify(organization, null, 2)}</pre>
      </div>

      <div className="mb-8 p-4 bg-blue-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Keycloak tokenParsed</h2>
        <pre className="text-sm overflow-auto">{JSON.stringify(keycloak.tokenParsed, null, 2)}</pre>
      </div>

      <div className="mb-8 p-4 bg-green-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Keycloak idTokenParsed</h2>
        <pre className="text-sm overflow-auto">{JSON.stringify(keycloak.idTokenParsed, null, 2)}</pre>
      </div>

      <div className="mb-8 p-4 bg-yellow-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Manually Decoded Access Token</h2>
        <pre className="text-sm overflow-auto">{JSON.stringify(accessTokenDecoded, null, 2)}</pre>
      </div>

      <div className="mb-8 p-4 bg-purple-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Manually Decoded ID Token</h2>
        <pre className="text-sm overflow-auto">{JSON.stringify(idTokenDecoded, null, 2)}</pre>
      </div>

      <div className="mb-8">
        <button 
          onClick={() => setShowRawToken(!showRawToken)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {showRawToken ? 'Hide' : 'Show'} Raw Tokens
        </button>
        
        {showRawToken && (
          <div className="mt-4">
            <div className="mb-4 p-4 bg-gray-200 rounded">
              <h3 className="font-semibold mb-2">Raw Access Token</h3>
              <pre className="text-xs break-all">{keycloak.token}</pre>
            </div>
            <div className="p-4 bg-gray-200 rounded">
              <h3 className="font-semibold mb-2">Raw ID Token</h3>
              <pre className="text-xs break-all">{keycloak.idToken}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="mb-8 p-4 bg-red-100 rounded">
        <h2 className="text-xl font-semibold mb-2">Troubleshooting Info</h2>
        <ul className="list-disc list-inside">
          <li>Keycloak URL: {process.env.NEXT_PUBLIC_KEYCLOAK_URL}</li>
          <li>Realm: {process.env.NEXT_PUBLIC_KEYCLOAK_REALM}</li>
          <li>Client ID: {process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}</li>
          <li>Organization ID from user: {user?.organizationId || 'NOT FOUND'}</li>
          <li>Organization Name from user: {user?.organizationName || 'NOT FOUND'}</li>
        </ul>
      </div>
    </div>
  )
}