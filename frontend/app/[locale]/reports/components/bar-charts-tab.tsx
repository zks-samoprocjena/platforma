'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart3, ChevronDown } from 'lucide-react'
import { useAssessments } from '@/hooks/api/use-assessments'
import { ComplianceComparisonChart } from './charts/compliance-comparison-chart'
import { MeasureComparisonChart } from './charts/measure-comparison-chart'
import { ProgressOverTimeChart } from './charts/progress-over-time-chart'
import { ControlPriorityBar } from './charts/control-priority-bar'
import { TopBottomControlsBar } from './charts/top-bottom-controls-bar'

export function BarChartsTab() {
  const t = useTranslations('Reports.charts')
  const tCommon = useTranslations('Common')
  const { data: assessmentsData, isLoading } = useAssessments()
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('')

  const assessments = assessmentsData?.items || []
  const completedAssessments = assessments.filter(a => a.status === 'completed')
  
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
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-semibold">{t('barCharts.title')}</h2>
      </div>

      {/* Assessment Selector for Measure Comparison */}
      <div className="assessment-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium">{t('barCharts.selectAssessment')}</h3>
            <p className="text-sm text-base-content/70 mt-1">
              {t('barCharts.selectAssessmentDescription')}
            </p>
          </div>
          <div className="form-control w-full max-w-xs">
            <select
              value={selectedAssessmentId}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
              className="select select-bordered w-full"
              disabled={isLoading || assessments.length === 0}
            >
              <option value="">{t('barCharts.chooseAssessment')}</option>
              {assessments
                .filter(a => a.status !== 'archived')
                .map((assessment) => {
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
              <h3 className="font-bold">{t('barCharts.incompleteWarning')}</h3>
              <div className="text-xs">
                {t('barCharts.incompleteWarningDescription', { 
                  percentage: selectedAssessment?.progress?.completion_percentage || 0 
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Comparison Chart */}
        <ComplianceComparisonChart 
          assessments={assessments}
          loading={isLoading}
        />

        {/* Measure Comparison Chart */}
        <MeasureComparisonChart 
          assessmentId={selectedAssessmentId}
          loading={isLoading}
          isIncomplete={isIncomplete}
        />

        {/* Control Priority Implementation */}
        <ControlPriorityBar 
          assessmentId={selectedAssessmentId}
          loading={isLoading}
          isIncomplete={isIncomplete}
        />

        {/* Top/Bottom Performing Controls */}
        <TopBottomControlsBar 
          assessmentId={selectedAssessmentId}
          loading={isLoading}
          isIncomplete={isIncomplete}
        />

        {/* Progress Over Time Chart */}
        <div className="lg:col-span-2">
          <ProgressOverTimeChart 
            assessments={assessments}
            loading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}