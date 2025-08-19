'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { useUser } from '@/hooks/useAuth'

export default function AuthSuccessPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('AuthSuccess')
  const router = useRouter()
  const user = useUser()
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    console.log('[AuthSuccess] User data on success page:', {
      user: user ? {
        id: user.id,
        email: user.email,
        roles: user.roles,
        name: user.name
      } : null
    });

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          
          // Check if user is admin and redirect accordingly
          const userRoles = user?.roles || []
          const isAdmin = userRoles.includes('admin')
          
          console.log('[AuthSuccess] Redirect decision:', {
            userRoles,
            isAdmin,
            redirectTo: isAdmin ? `/${locale}/admin` : `/${locale}/dashboard`
          });
          
          if (isAdmin) {
            router.push(`/${locale}/admin`)
          } else {
            router.push(`/${locale}/dashboard`)
          }
          
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [router, locale, user])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-success/10 to-base-300">
      <div className="max-w-md w-full space-y-8">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-success/10 p-3">
                <CheckCircleIcon className="h-12 w-12 text-success" />
              </div>
            </div>
            
            <h2 className="card-title text-center text-2xl font-bold text-base-content justify-center">
              {t('title')}
            </h2>
            
            <p className="text-center text-base-content/70 mt-2">
              {t('message')}
            </p>
            
            <div className="flex justify-center mt-6">
              <div className="radial-progress text-primary" style={{"--value": (3 - countdown) * 33.33} as React.CSSProperties}>
                {countdown}s
              </div>
            </div>
            
            <p className="text-center text-sm text-base-content/60 mt-4">
              {t('redirecting_in', { seconds: countdown })}
            </p>
            
            <div className="card-actions justify-center mt-6">
              <button 
                onClick={() => {
                  const userRoles = user?.roles || []
                  const isAdmin = userRoles.includes('admin')
                  
                  console.log('[AuthSuccess] Continue button clicked:', {
                    userRoles,
                    isAdmin,
                    redirectTo: isAdmin ? `/${locale}/admin` : `/${locale}/dashboard`
                  });
                  
                  if (isAdmin) {
                    router.push(`/${locale}/admin`)
                  } else {
                    router.push(`/${locale}/dashboard`)
                  }
                }}
                className="btn btn-primary"
              >
                {t('continue_now')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}