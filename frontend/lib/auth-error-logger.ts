/**
 * Authentication Error Logger
 * Properly logs and reports authentication errors instead of hiding them with fallback values
 */

interface AuthError {
  type: 'MISSING_USER_DATA' | 'TOKEN_MISMATCH' | 'INVALID_TOKEN' | 'SESSION_ERROR'
  message: string
  details?: any
  timestamp: string
  url?: string
  keycloakState?: any
}

class AuthErrorLogger {
  private errors: AuthError[] = []
  private maxErrors = 100
  
  logError(type: AuthError['type'], message: string, details?: any) {
    const error: AuthError = {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }
    
    // Add Keycloak state if available
    if (typeof window !== 'undefined' && (window as any).keycloak) {
      const keycloak = (window as any).keycloak
      error.keycloakState = {
        authenticated: keycloak.authenticated,
        hasToken: !!keycloak.token,
        hasTokenParsed: !!keycloak.tokenParsed,
        subject: keycloak.subject,
        tokenExpired: keycloak.isTokenExpired?.(),
        realm: keycloak.realm,
        clientId: keycloak.clientId
      }
    }
    
    // Log to console with appropriate level
    console.error(`[AuthError] ${type}: ${message}`, error)
    
    // Store error
    this.errors.push(error)
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }
    
    // In production, this would send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      this.reportToService(error)
    }
  }
  
  private reportToService(error: AuthError) {
    // TODO: Integrate with error tracking service (Sentry, LogRocket, etc.)
    // For now, just log that we would report it
    console.info('[AuthError] Would report to error tracking service:', error)
  }
  
  getErrors(): AuthError[] {
    return [...this.errors]
  }
  
  clearErrors() {
    this.errors = []
  }
  
  // Check for common auth issues
  checkAuthState() {
    if (typeof window === 'undefined') return
    
    const keycloak = (window as any).keycloak
    if (!keycloak) {
      this.logError('SESSION_ERROR', 'Keycloak instance not found')
      return
    }
    
    if (keycloak.authenticated && !keycloak.tokenParsed) {
      this.logError('TOKEN_MISMATCH', 'User authenticated but token not parsed')
    }
    
    if (keycloak.authenticated && keycloak.isTokenExpired?.()) {
      this.logError('INVALID_TOKEN', 'Token has expired but user still marked as authenticated')
    }
    
    if (keycloak.authenticated && !keycloak.subject) {
      this.logError('MISSING_USER_DATA', 'No subject ID in authenticated session')
    }
  }
}

// Export singleton instance
export const authErrorLogger = new AuthErrorLogger()

// Helper function to check and log auth errors
export function checkAuthenticationState(isAuthenticated: boolean, user: any) {
  if (isAuthenticated && !user) {
    authErrorLogger.logError(
      'MISSING_USER_DATA',
      'User is authenticated but user data is null',
      { isAuthenticated, user }
    )
    return false
  }
  
  if (isAuthenticated && user && (!user.id || !user.email)) {
    authErrorLogger.logError(
      'MISSING_USER_DATA',
      'User data is incomplete - missing required fields',
      { 
        hasId: !!user.id,
        hasEmail: !!user.email,
        hasName: !!user.name,
        user
      }
    )
    return false
  }
  
  return true
}