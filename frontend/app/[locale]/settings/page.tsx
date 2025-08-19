import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { SettingsClient } from './settings-client'
import { getTranslations } from 'next-intl/server'

interface SettingsPageProps {
  params: {
    locale: string
  }
}

export default async function SettingsPage({ params: { locale } }: SettingsPageProps) {
  setRequestLocale(locale)
  const t = await getTranslations('Settings')

  return (
    <DashboardLayout>
      <Suspense fallback={
        <div className="space-y-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-primary mb-2">
              {t('header.title')}
            </h1>
            <p className="text-lg text-base-content/70">
              {t('header.subtitle')}
            </p>
          </div>
          
          <div className="grid lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="assessment-card">
                <div className="animate-pulse space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 bg-base-200 rounded-lg"></div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-3">
              <div className="assessment-card">
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-base-200 rounded w-1/3"></div>
                  <div className="space-y-3">
                    <div className="h-12 bg-base-200 rounded"></div>
                    <div className="h-12 bg-base-200 rounded"></div>
                    <div className="h-12 bg-base-200 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      }>
        <SettingsClient />
      </Suspense>
    </DashboardLayout>
  )
}