import Keycloak from 'keycloak-js'
import { keycloakConfig } from './keycloak-config'

interface KeycloakManagerState {
  instance: Keycloak | null
  initPromise: Promise<boolean> | null
  initialized: boolean
}

class KeycloakManager {
  private static state: KeycloakManagerState = {
    instance: null,
    initPromise: null,
    initialized: false,
  }

  static getInstance(): Keycloak {
    if (!this.state.instance) {
      console.log('Creating new Keycloak instance')
      this.state.instance = new Keycloak(keycloakConfig)
    }
    return this.state.instance
  }

  static async init(options?: Keycloak.KeycloakInitOptions): Promise<boolean> {
    // If already initialized, return true
    if (this.state.initialized && this.state.instance?.authenticated !== undefined) {
      console.log('Keycloak already initialized, returning existing state')
      return this.state.instance.authenticated
    }

    // If initialization is in progress, return the existing promise
    if (this.state.initPromise) {
      console.log('Keycloak initialization already in progress')
      return this.state.initPromise
    }

    // Start new initialization
    console.log('Starting Keycloak initialization')
    const instance = this.getInstance()

    this.state.initPromise = instance
      .init({
        onLoad: 'check-sso',
        checkLoginIframe: false, // Disable for now to avoid iframe issues
        pkceMethod: 'S256',
        scope: 'openid profile email roles', // Explicitly request scopes including roles
        silentCheckSsoRedirectUri: typeof window !== 'undefined'
          ? `${window.location.origin}/silent-check-sso.html`
          : undefined,
        ...options,
      })
      .then((authenticated) => {
        console.log('Keycloak initialization complete:', authenticated)
        this.state.initialized = true
        return authenticated
      })
      .catch((error) => {
        console.error('Keycloak initialization failed:', error)
        this.state.initPromise = null
        this.state.initialized = false
        throw error
      })

    return this.state.initPromise
  }

  static reset(): void {
    console.log('Resetting Keycloak manager')
    this.state = {
      instance: null,
      initPromise: null,
      initialized: false,
    }
  }

  static isInitialized(): boolean {
    return this.state.initialized
  }

  static getToken(): string | undefined {
    return this.state.instance?.token
  }

  static getRefreshToken(): string | undefined {
    return this.state.instance?.refreshToken
  }

  static getIdToken(): string | undefined {
    return this.state.instance?.idToken
  }

  static async updateToken(minValidity: number): Promise<boolean> {
    if (!this.state.instance || !this.state.initialized) {
      throw new Error('Keycloak not initialized')
    }

    try {
      const refreshed = await this.state.instance.updateToken(minValidity)
      return refreshed
    } catch (error) {
      console.error('Token refresh failed:', error)
      throw error
    }
  }
}

export default KeycloakManager