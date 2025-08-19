'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Radar, CalendarSearch } from 'lucide-react'
import { SecurityLevelProfile } from './charts/security-level-profile'
import { AssessmentDimensions } from './charts/assessment-dimensions'
import { SubmeasureComplianceSpider } from './charts/submeasure-compliance-spider'
import { SecurityCategoriesSpider } from './charts/security-categories-spider'
import { useAssessments } from '@/hooks/api/use-assessments'

export function SpiderDiagramTab() {
  const t = useTranslations('Reports.charts')
  const tCommon = useTranslations('Common')
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('')
  
  // Fetch assessments for selection
  const { data: assessmentsData, isLoading: isLoadingAssessments } = useAssessments()
  const assessments = assessmentsData?.items || []
  
  // Find selected assessment to check its status
  const selectedAssessment = assessments.find(a => a.id === selectedAssessmentId)
  const isIncomplete = selectedAssessment && selectedAssessment.status !== 'completed'

  // Helper to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-success'
      case 'in_progress': return 'text-warning'
      case 'review': return 'text-info'
      case 'draft': return 'text-base-content/50'
      default: return 'text-base-content/50'
    }
  }

  // Helper to format status text
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return tCommon('status.completed')
      case 'in_progress': return tCommon('status.inProgress')
      case 'review': return tCommon('status.review')
      case 'draft': return tCommon('status.draft')
      default: return status
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="flex items-center gap-2 mb-4">
        <Radar className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-semibold">{t('spiderDiagram.title')}</h2>
      </div>

      {/* Assessment Selector */}
      <div className="assessment-card p-6">
        <div className="flex items-center gap-4">
          <CalendarSearch className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">
              {t('spiderDiagram.selectAssessment')}
            </label>
            <select
              value={selectedAssessmentId}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
              className="select select-bordered w-full max-w-md"
              disabled={isLoadingAssessments}
            >
              <option value="">{t('spiderDiagram.selectPlaceholder')}</option>
              {assessments
                .filter(a => a.status !== 'archived')
                .map(assessment => {
                  const completionPercentage = assessment.progress?.completion_percentage || 0
                  const statusText = getStatusText(assessment.status)
                  const statusColor = getStatusColor(assessment.status)
                  
                  return (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title} • {statusText} ({completionPercentage}%)
                    </option>
                  )
                })}
            </select>
          </div>
        </div>
        
        {/* Warning for incomplete assessments */}
        {isIncomplete && (
          <div className="alert alert-warning mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-bold">{t('spiderDiagram.incompleteWarning')}</h3>
              <div className="text-xs">
                {t('spiderDiagram.incompleteWarningDescription', { 
                  percentage: selectedAssessment?.progress?.completion_percentage || 0 
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assessment Maturity Profile - First */}
        <AssessmentDimensions 
          assessmentId={selectedAssessmentId}
          loading={isLoadingAssessments}
          isIncomplete={isIncomplete}
        />

        {/* Security Categories Performance - Second */}
        <SecurityCategoriesSpider 
          assessmentId={selectedAssessmentId}
          loading={isLoadingAssessments}
          isIncomplete={isIncomplete}
        />

        {/* Documentation vs Implementation - Third */}
        <SecurityLevelProfile 
          assessmentId={selectedAssessmentId}
          loading={isLoadingAssessments}
          isIncomplete={isIncomplete}
        />

        {/* Submeasure Compliance - Fourth */}
        <SubmeasureComplianceSpider 
          assessmentId={selectedAssessmentId}
          loading={isLoadingAssessments}
          isIncomplete={isIncomplete}
        />
      </div>

      {/* Additional Info */}
      {selectedAssessmentId && (
        <div className="assessment-card p-6 bg-base-200/50">
          <h3 className="text-lg font-semibold mb-3">{t('spiderDiagram.interpretation')}</h3>
          <div className="prose prose-sm max-w-none">
            <ul>
              <li>{t('spiderDiagram.interpretationDoc')}</li>
              <li>{t('spiderDiagram.interpretationImpl')}</li>
              <li>{t('spiderDiagram.interpretationDimensions')}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}