import KeycloakManager from './keycloak-manager'

export async function getAccessToken(): Promise<string | undefined> {
  // Ensure Keycloak is initialized
  if (!KeycloakManager.isInitialized()) {
    console.warn('Keycloak not initialized, attempting to get token anyway')
  }

  // Get the current token
  const token = KeycloakManager.getToken()
  
  if (token) {
    try {
      // Try to update token if it's close to expiry (within 30 seconds)
      const refreshed = await KeycloakManager.updateToken(30)
      if (refreshed) {
        console.log('Token was refreshed')
        return KeycloakManager.getToken()
      }
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }
  
  return token
}