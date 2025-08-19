'use client'

import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

const errorMessages: Record<string, string> = {
  Configuration: 'auth_error_configuration',
  AccessDenied: 'auth_error_access_denied',
  Verification: 'auth_error_verification',
  Default: 'auth_error_default',
}

export default function AuthErrorPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('AuthError')
  const searchParams = useSearchParams()
  const error = searchParams.get('error') || 'Default'
  
  const errorMessageKey = errorMessages[error] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-error/10 to-base-300">
      <div className="max-w-md w-full space-y-8">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-error/10 p-3">
                <ExclamationTriangleIcon className="h-12 w-12 text-error" />
              </div>
            </div>
            
            <h2 className="card-title text-center text-2xl font-bold text-base-content justify-center">
              {t('title')}
            </h2>
            
            <p className="text-center text-base-content/70 mt-2">
              {t(errorMessageKey)}
            </p>
            
            {error && error !== 'Default' && (
              <div className="bg-base-200 rounded-lg p-3 mt-4">
                <p className="text-sm text-base-content/60">
                  {t('error_code')}: <span className="font-mono">{error}</span>
                </p>
              </div>
            )}
            
            <div className="card-actions justify-center mt-6 space-x-4">
              <Link 
                href={`/${locale}/auth/signin`}
                className="btn btn-primary"
              >
                {t('try_again')}
              </Link>
              
              <Link 
                href={`/${locale}`}
                className="btn btn-ghost"
              >
                {t('go_home')}
              </Link>
            </div>
            
            <div className="divider">{t('or')}</div>
            
            <p className="text-center text-sm text-base-content/60">
              {t('contact_support')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}