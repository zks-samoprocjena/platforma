import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import QuickActions from '@/components/dashboard/quick-actions'
import { KPIGrid } from '@/components/dashboard/kpi-grid'
import { ActivitiesDeadlines } from '@/components/dashboard/activities-deadlines'

interface DashboardPageProps {
  params: { locale: string }
}

export default function DashboardPage({ params: { locale } }: DashboardPageProps) {
  setRequestLocale(locale)
  const t = useTranslations('Dashboard')

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-base-100 rounded-lg shadow-sm border border-base-300 p-6">
          <h1 className="text-3xl font-bold text-base-content mb-2">
            {t('title')}
          </h1>
          <p className="text-base-content/70">
            {t('subtitle')}
          </p>
        </div>

        {/* KPI Grid - High Priority Overview */}
        <KPIGrid />

        {/* Activities & Deadlines - Full width */}
        <ActivitiesDeadlines />

        {/* Quick Actions */}
        <QuickActions />
      </div>
    </DashboardLayout>
  )
}