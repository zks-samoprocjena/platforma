import { setRequestLocale } from 'next-intl/server'
import DashboardLayout from '@/components/dashboard/dashboard-layout'
import { NewAssessmentClient } from './new-assessment-client'

interface NewAssessmentPageProps {
  params: {
    locale: string
  }
}

export default function NewAssessmentPage({ params: { locale } }: NewAssessmentPageProps) {
  setRequestLocale(locale)

  return (
    <DashboardLayout>
      <NewAssessmentClient />
    </DashboardLayout>
  )
}