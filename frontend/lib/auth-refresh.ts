import KeycloakManager from './keycloak-manager'
import { toast } from 'react-hot-toast'

/**
 * Force refresh the Keycloak session to get updated user attributes
 * This is needed after organization creation to get the new organization ID in the JWT
 */
export async function refreshKeycloakSession(): Promise<boolean> {
  try {
    const keycloak = KeycloakManager.getInstance()
    
    if (!keycloak?.authenticated) {
      console.error('[refreshKeycloakSession] User not authenticated')
      return false
    }
    
    // Force token refresh
    const refreshed = await keycloak.updateToken(-1)
    
    if (refreshed) {
      console.log('[refreshKeycloakSession] Token refreshed successfully')
      
      // Reload the page to ensure all components get the new token
      window.location.reload()
      return true
    } else {
      console.log('[refreshKeycloakSession] Token was still valid, forcing logout/login')
      
      // If token wasn't refreshed (still valid), we need to force a new login
      // Store the current URL to redirect back after login
      const currentUrl = window.location.pathname
      sessionStorage.setItem('redirectAfterLogin', currentUrl)
      
      // Logout and immediately login again
      await keycloak.logout({ redirectUri: window.location.origin + '/hr/auth/signin' })
      return true
    }
  } catch (error) {
    console.error('[refreshKeycloakSession] Failed to refresh session:', error)
    toast.error('Failed to refresh session. Please login again.')
    return false
  }
}

/**
 * Check if we need to redirect after login
 */
export function checkPostLoginRedirect() {
  const redirectUrl = sessionStorage.getItem('redirectAfterLogin')
  if (redirectUrl) {
    sessionStorage.removeItem('redirectAfterLogin')
    window.location.href = redirectUrl
  }
}