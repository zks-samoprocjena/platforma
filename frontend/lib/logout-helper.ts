/**
 * Helper function to perform a complete logout
 * Ensures all session data, cookies, and state are cleared
 */

import Cookies from 'js-cookie'
import KeycloakManager from './keycloak-manager'

export function performCompleteLogout(locale: string = 'hr') {
  console.log('[Logout] Starting complete logout process')
  
  // 1. Clear all cookies FIRST
  clearAllCookies()
  
  // 2. Clear all storage
  clearAllStorage()
  
  // 3. Get Keycloak instance before resetting
  let keycloak: any
  try {
    keycloak = KeycloakManager.getInstance()
  } catch (error) {
    console.error('[Logout] Error getting Keycloak instance:', error)
  }
  
  // 4. If we have a keycloak instance, logout through it
  if (keycloak && typeof keycloak.logout === 'function') {
    console.log('[Logout] Calling Keycloak logout with redirect')
    
    // Force logout with post_logout_redirect_uri
    const logoutUrl = `${keycloak.authServerUrl}/realms/${keycloak.realm}/protocol/openid-connect/logout?` +
      `id_token_hint=${keycloak.idToken}&` +
      `post_logout_redirect_uri=${encodeURIComponent(window.location.origin + '/' + locale)}`
    
    // Clear everything before redirect
    clearAllCookies()
    clearAllStorage()
    
    // Reset manager after getting the URL
    try {
      KeycloakManager.reset()
    } catch (error) {
      console.error('[Logout] Error resetting Keycloak manager:', error)
    }
    
    // Navigate to logout URL
    window.location.href = logoutUrl
  } else {
    // Fallback: clear everything and redirect
    console.log('[Logout] No Keycloak instance, clearing and redirecting')
    
    // Try to reset manager
    try {
      KeycloakManager.reset()
    } catch (error) {
      console.error('[Logout] Error resetting Keycloak manager:', error)
    }
    
    // Redirect to landing page
    window.location.href = `/${locale}`
  }
}

function clearAllCookies() {
  console.log('[Logout] Clearing all cookies')
  
  // List of known auth cookies
  const authCookies = [
    'keycloak-token',
    'keycloak-refresh-token', 
    'keycloak-id-token',
    'kc-access',
    'kc-state',
    'AUTH_SESSION_ID',
    'KEYCLOAK_SESSION',
    'KEYCLOAK_IDENTITY',
    'KEYCLOAK_SESSION_LEGACY',
    'KEYCLOAK_IDENTITY_LEGACY'
  ]
  
  // Remove specific cookies
  authCookies.forEach(cookieName => {
    Cookies.remove(cookieName, { path: '/' })
    Cookies.remove(cookieName) // Try without path too
  })
  
  // Nuclear option: clear ALL cookies
  document.cookie.split(";").forEach((c) => {
    const eqPos = c.indexOf("=")
    const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim()
    // Clear cookie for all possible paths
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`
  })
}

function clearAllStorage() {
  console.log('[Logout] Clearing all storage')
  
  try {
    // Clear session storage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear()
    }
    
    // Clear local storage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    
    // Clear IndexedDB (if used)
    if ('indexedDB' in window) {
      indexedDB.databases().then(databases => {
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name)
          }
        })
      }).catch(err => {
        console.error('[Logout] Error clearing IndexedDB:', err)
      })
    }
  } catch (error) {
    console.error('[Logout] Error clearing storage:', error)
  }
}

export function ensureLoggedOut() {
  /**
   * Verify that user is actually logged out
   * Returns true if logged out, false if still has auth
   */
  const token = Cookies.get('keycloak-token')
  const keycloak = KeycloakManager.getInstance()
  
  return !token && !keycloak?.authenticated
}