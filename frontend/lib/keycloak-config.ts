import Keycloak from 'keycloak-js'

export const keycloakConfig = {
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM!,
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL!,
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID!,
}

export const keycloakInitOptions: Keycloak.KeycloakInitOptions = {
  onLoad: 'check-sso',
  silentCheckSsoRedirectUri:
    typeof window !== 'undefined'
      ? `${window.location.origin}/silent-check-sso.html`
      : undefined,
  pkceMethod: 'S256',
  checkLoginIframe: false, // Disabled to prevent iframe timeout issues
  enableLogging: true,
}

export const getKeycloakInstance = () => {
  if (typeof window === 'undefined') {
    return null
  }
  return new Keycloak(keycloakConfig)
}