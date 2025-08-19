'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUser, useOrganization } from '@/hooks/useAuth'
import { apiEndpoints } from '@/lib/api-config'

interface OrganizationCheckProps {
  children: React.ReactNode
}

export function OrganizationCheck({ children }: OrganizationCheckProps) {
  const user = useUser()
  const { organizationId } = useOrganization()
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkOrganization = async () => {
      // Skip check if we're already on the setup page
      if (pathname?.includes('/organization/setup')) {
        setIsChecking(false)
        return
      }
      
      if (!user) {
        setIsChecking(false)
        return
      }


      // Check session storage for recent setup completion
      const setupComplete = sessionStorage.getItem('organizationSetupComplete')
      const tempOrgId = sessionStorage.getItem('organizationId')
      
      // If we just completed setup, use the temporary org ID
      const effectiveOrgId = organizationId || tempOrgId
      
      // Check if user has organization assigned
      if (!effectiveOrgId) {
        // User doesn't have organization, redirect to setup
        router.push('/hr/organization/setup')
        return
      }

      // Check if organization setup is completed
      try {
        const response = await fetch(apiEndpoints.organizations.get(effectiveOrgId), {
          headers: {
            'Authorization': `Bearer ${(window as any).keycloak?.token}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          const org = await response.json()
          console.log('[OrganizationCheck] Organization data:', org)
          
          // If we have temporary setup complete flag, trust it
          if (setupComplete === 'true') {
            console.log('[OrganizationCheck] Setup marked complete in session, allowing access')
            // Clear the temporary flags after successful check
            sessionStorage.removeItem('organizationSetupComplete')
            setIsChecking(false)
            return
          }
          
          if (!org.setup_completed) {
            // Organization exists but setup not completed
            console.log('[OrganizationCheck] Setup not completed, redirecting to setup')
            router.push('/hr/organization/setup')
            return
          }
        } else if (response.status === 404) {
          // Organization not found, redirect to setup
          console.log('[OrganizationCheck] Organization not found, redirecting to setup')
          router.push('/hr/organization/setup')
          return
        }
      } catch (error) {
        console.error('[OrganizationCheck] Failed to check organization:', error)
      }

      setIsChecking(false)
    }

    checkOrganization()
  }, [user, organizationId, router, pathname])

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="mt-4">Provjera organizacije...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}