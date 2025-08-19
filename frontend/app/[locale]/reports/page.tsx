import { setRequestLocale } from 'next-intl/server'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { ReportsClient } from './reports-client'

interface ReportsPageProps {
  params: {
    locale: string
  }
}

export default function ReportsPage({ params: { locale } }: ReportsPageProps) {
  setRequestLocale(locale)

  return (
    <DashboardLayout>
      <ReportsClient />
    </DashboardLayout>
  )
}