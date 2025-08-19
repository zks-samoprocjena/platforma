import { setRequestLocale } from 'next-intl/server'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { HelpClient } from './help-client'

interface HelpPageProps {
  params: {
    locale: string
  }
}

export default function HelpPage({ params: { locale } }: HelpPageProps) {
  setRequestLocale(locale)

  return (
    <DashboardLayout>
      <HelpClient />
    </DashboardLayout>
  )
}