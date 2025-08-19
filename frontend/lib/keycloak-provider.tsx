'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import toast from 'react-hot-toast'
import KeycloakManager from './keycloak-manager'
import type Keycloak from 'keycloak-js'

interface KeycloakContextType {
  keycloak: Keycloak | null
  initialized: boolean
  isAuthenticated: boolean
}

const KeycloakContext = createContext<KeycloakContextType>({
  keycloak: null,
  initialized: false,
  isAuthenticated: false,
})

export const useKeycloakContext = () => useContext(KeycloakContext)

interface KeycloakProviderProps {
  children: React.ReactNode
}

const KEYCLOAK_TOKEN_COOKIE = 'keycloak-token'
const KEYCLOAK_REFRESH_TOKEN_COOKIE = 'keycloak-refresh-token'
const KEYCLOAK_ID_TOKEN_COOKIE = 'keycloak-id-token'
const TOKEN_MIN_VALIDITY = 70

export function KeycloakProvider({ children }: KeycloakProviderProps) {
  const [initialized, setInitialized] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null)
  
  const router = useRouter()
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const initStartedRef = useRef(false)

  // Initialize Keycloak
  useEffect(() => {
    // Prevent multiple initializations
    if (initStartedRef.current) {
      return
    }
    initStartedRef.current = true

    const initKeycloak = async () => {
      try {
        const instance = KeycloakManager.getInstance()
        setKeycloak(instance)

        // Set up event handlers before initialization
        instance.onReady = (authenticated) => {
          console.log('Keycloak ready:', authenticated)
          console.log('[KeycloakProvider onReady] Token parsed:', instance.tokenParsed)
          console.log('[KeycloakProvider onReady] ID Token parsed:', instance.idTokenParsed)
          if (instance.tokenParsed) {
            console.log('[KeycloakProvider onReady] Token keys:', Object.keys(instance.tokenParsed))
          }
          setIsAuthenticated(authenticated || false)
          updateCookies(instance)
        }

        instance.onAuthSuccess = () => {
          console.log('Auth success')
          console.log('[KeycloakProvider] Token parsed:', instance.tokenParsed)
          console.log('[KeycloakProvider] ID Token parsed:', instance.idTokenParsed)
          console.log('[KeycloakProvider] Token:', instance.token?.substring(0, 50) + '...')
          setIsAuthenticated(true)
          updateCookies(instance)
        }

        instance.onAuthError = () => {
          console.error('Auth error')
          setIsAuthenticated(false)
          clearCookies()
        }

        instance.onAuthRefreshSuccess = () => {
          console.log('Token refreshed')
          updateCookies(instance)
        }

        instance.onAuthRefreshError = () => {
          console.error('Token refresh failed')
          toast.error('Session expired. Please login again.')
          instance.logout()
        }

        instance.onAuthLogout = () => {
          console.log('User logged out')
          setIsAuthenticated(false)
          clearCookies()
          
          // Reset Keycloak manager state
          KeycloakManager.reset()
          
          // Clear any remaining auth state
          if (typeof window !== 'undefined') {
            // Remove all cookies
            document.cookie.split(";").forEach((c) => {
              document.cookie = c
                .replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
            
            // Clear storage
            sessionStorage.clear();
            localStorage.clear();
          }
        }

        instance.onTokenExpired = () => {
          console.log('Token expired, attempting refresh...')
          instance.updateToken(TOKEN_MIN_VALIDITY).catch(() => {
            console.error('Failed to refresh token on expiry')
            instance.logout()
          })
        }

        // Initialize Keycloak
        const authenticated = await KeycloakManager.init()
        setIsAuthenticated(authenticated)
        setInitialized(true)

        if (authenticated) {
          updateCookies(instance)
          setupTokenRefresh(instance)
        }
      } catch (error) {
        console.error('Keycloak initialization failed:', error)
        setInitialized(true) // Set as initialized even on error to prevent loading state
        toast.error('Failed to initialize authentication')
      }
    }

    initKeycloak()

    // Cleanup function
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [])

  // Set up token refresh when authenticated
  useEffect(() => {
    if (keycloak && isAuthenticated) {
      setupTokenRefresh(keycloak)
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [keycloak, isAuthenticated])

  const setupTokenRefresh = (instance: Keycloak) => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }

    // Set up new refresh interval
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const refreshed = await KeycloakManager.updateToken(TOKEN_MIN_VALIDITY)
        
        if (refreshed) {
          console.log('Token refreshed successfully')
          updateCookies(instance)
        }
      } catch (error) {
        console.error('Token refresh failed:', error)
        toast.error('Session expired. Please login again.')
        instance.logout()
      }
    }, 30000) // Check every 30 seconds
  }

  const updateCookies = (instance: Keycloak) => {
    if (instance.token) {
      Cookies.set(KEYCLOAK_TOKEN_COOKIE, instance.token, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    }
    if (instance.refreshToken) {
      Cookies.set(KEYCLOAK_REFRESH_TOKEN_COOKIE, instance.refreshToken, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    }
    if (instance.idToken) {
      Cookies.set(KEYCLOAK_ID_TOKEN_COOKIE, instance.idToken, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      })
    }
  }

  const clearCookies = () => {
    // Remove specific Keycloak cookies
    Cookies.remove(KEYCLOAK_TOKEN_COOKIE, { path: '/' })
    Cookies.remove(KEYCLOAK_REFRESH_TOKEN_COOKIE, { path: '/' })
    Cookies.remove(KEYCLOAK_ID_TOKEN_COOKIE, { path: '/' })
    
    // Also try removing with different paths in case they were set differently
    Cookies.remove(KEYCLOAK_TOKEN_COOKIE)
    Cookies.remove(KEYCLOAK_REFRESH_TOKEN_COOKIE)
    Cookies.remove(KEYCLOAK_ID_TOKEN_COOKIE)
    
    // Remove any other auth-related cookies
    const cookiesToRemove = ['kc-access', 'kc-state', 'AUTH_SESSION_ID', 'KEYCLOAK_SESSION', 'KEYCLOAK_IDENTITY']
    cookiesToRemove.forEach(cookieName => {
      Cookies.remove(cookieName, { path: '/' })
      Cookies.remove(cookieName)
    })
  }

  const contextValue: KeycloakContextType = {
    keycloak,
    initialized,
    isAuthenticated,
  }

  if (!initialized) {
    return <div>Loading Keycloak...</div>
  }

  return (
    <KeycloakContext.Provider value={contextValue}>
      {children}
    </KeycloakContext.Provider>
  )
}