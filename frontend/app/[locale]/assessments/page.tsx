import { setRequestLocale } from 'next-intl/server'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { AssessmentPageClient } from './assessment-page-client'

interface AssessmentsPageProps {
  params: {
    locale: string
  }
}

export default function AssessmentsPage({ params: { locale } }: AssessmentsPageProps) {
  setRequestLocale(locale)

  return (
    <DashboardLayout>
      <AssessmentPageClient />
    </DashboardLayout>
  )
}