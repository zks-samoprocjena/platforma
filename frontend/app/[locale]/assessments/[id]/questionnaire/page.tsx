import { notFound } from 'next/navigation'
import QuestionnaireClient from './questionnaire-client'

interface PageProps {
  params: {
    locale: string
    id: string
  }
}

export default function QuestionnairePage({ params }: PageProps) {
  const { id } = params

  if (!id) {
    notFound()
  }

  return <QuestionnaireClient assessmentId={id} />
}