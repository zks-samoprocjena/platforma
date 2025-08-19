'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AssessmentList } from '@/components/assessment/assessment-list'
import { AssessmentCreationModal } from '@/components/assessment/assessment-creation-modal'

export function AssessmentPageClient() {
  const t = useTranslations()
  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-base-content">{t('Navigation.assessments')}</h1>
        <p className="text-base-content/70 mt-2">{t('Dashboard.subtitle')}</p>
      </div>

      <AssessmentList onCreateNew={() => setShowCreateModal(true)} />
      
      <AssessmentCreationModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  )
}