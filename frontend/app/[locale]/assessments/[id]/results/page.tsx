import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import ResultsClient from './results-client'

interface ResultsPageProps {
  params: {
    locale: string
    id: string
  }
}

export function generateMetadata({ params }: ResultsPageProps): Metadata {
  return {
    title: `Assessment Results - AI Assessment Platform`,
    description: 'Comprehensive compliance assessment results and analysis'
  }
}

export default function ResultsPage({ params }: ResultsPageProps) {
  setRequestLocale(params.locale)
  
  return <ResultsClient assessmentId={params.id} />
}