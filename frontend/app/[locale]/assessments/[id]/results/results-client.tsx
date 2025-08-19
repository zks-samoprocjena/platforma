'use client'

import { useTranslations } from 'next-intl'
import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useAssessment, useAssessmentResults, useAssessmentInsights, useRefreshAssessmentInsights } from '@/hooks/api/use-assessments'
import ResultsHeader from '@/components/results/results-header'
import ComplianceOverview from '@/components/results/compliance-overview'
import MeasureBreakdown from '@/components/results/measure-breakdown'
import LoadingSpinner from '@/components/ui/loading-spinner'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useLocale } from 'next-intl'
import { ErrorBoundary } from '@/components/error-boundary'

// Lazy load heavy components for better performance
const GapAnalysis = lazy(() => import('@/components/results/gap-analysis'))
const RecommendationsPanel = lazy(() => import('@/components/results/recommendations-panel'))
const ExportPanel = lazy(() => import('@/components/results/export-panel'))
const ImprovementRoadmap = lazy(() => import('@/components/results/improvement-roadmap'))
const ComplianceLiveStatus = lazy(() => import('@/components/assessment/compliance-live-status').then(module => ({ default: module.ComplianceLiveStatus })))
const DocumentGenerationPanel = lazy(() => import('@/components/compliance-documents').then(module => ({ default: module.DocumentGenerationPanel })))

interface ResultsClientProps {
  assessmentId: string
}

export default function ResultsClient({ assessmentId }: ResultsClientProps) {
  const t = useTranslations('results')
  const locale = useLocale()
  const [activeTab, setActiveTab] = useState<'overview' | 'compliance' | 'gaps' | 'recommendations' | 'roadmap' | 'documents' | 'export'>('overview')

  // Memoized tab handlers
  const handleTabChange = useCallback((tab: 'overview' | 'compliance' | 'gaps' | 'recommendations' | 'roadmap' | 'documents' | 'export') => {
    setActiveTab(tab)
  }, [])

  const { 
    data: assessment, 
    isLoading: isLoadingAssessment, 
    error: assessmentError 
  } = useAssessment(assessmentId)

  const { 
    data: results, 
    isLoading: isLoadingResults, 
    error: resultsError 
  } = useAssessmentResults(assessmentId)

  const { data: insights, isLoading: isLoadingInsights } = useAssessmentInsights(assessmentId, true)
  const refreshInsights = useRefreshAssessmentInsights()

  // Memoized export data to avoid recreating objects
  const exportData = useMemo(() => {
    if (!assessment || !results) return null
    return {
      id: assessment.assessment.id,
      title: assessment.assessment.title,
      created_at: assessment.assessment.created_at,
      security_level: assessment.assessment.security_level,
      organization_name: 'Organizacija' // TODO: Get organization name from organization_id
    }
  }, [assessment, results])

  if (isLoadingAssessment || isLoadingResults || isLoadingInsights) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (assessmentError || resultsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-error mb-4">
            {t('error.title')}
          </h2>
          <p className="text-base-content/70">
            {t('error.message')}
          </p>
        </div>
      </div>
    )
  }

  if (!assessment || !results) {
    return null
  }

  const lastComputed = insights?.computed_at ? new Date(insights.computed_at).toLocaleString() : null

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-6">
        <ResultsHeader
          assessment={assessment.assessment}
          results={results}
        />

        {/* Insights status bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-base-content/60">
            {lastComputed ? `${t('lastComputedAt')}: ${lastComputed}` : t('noInsights')}
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => refreshInsights.mutate(assessmentId)}
            disabled={refreshInsights.isPending}
          >
            {t('refreshInsights')}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="tabs tabs-boxed mb-6 bg-base-200 overflow-x-auto">
          {(['overview','compliance','gaps','recommendations','roadmap','documents','export'] as const).map((tab) => (
            <button
              key={tab}
              data-testid={`tab-${tab}`}
              className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8" data-testid="overview-content">
            <ErrorBoundary>
              <ComplianceOverview 
                assessment={assessment.assessment}
                results={results}
              />
            </ErrorBoundary>
            <ErrorBoundary>
              <MeasureBreakdown 
                assessment={assessment.assessment}
                results={results}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'compliance' && (
          <ErrorBoundary>
            <Suspense fallback={<CardSkeleton />}>
              <ComplianceLiveStatus 
                assessmentId={assessmentId}
                securityLevel={assessment.assessment.security_level}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'gaps' && insights && (
          <ErrorBoundary>
            <Suspense fallback={<CardSkeleton />}>
              <GapAnalysis 
                assessment={assessment.assessment}
                results={results}
                insights={insights}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'recommendations' && (
          <ErrorBoundary>
            <Suspense fallback={<CardSkeleton />}>
              <RecommendationsPanel 
                assessmentId={assessmentId}
                organizationId={assessment.assessment.organization_id}
                results={results}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'roadmap' && insights && (
          <ErrorBoundary>
            <Suspense fallback={<CardSkeleton />}>
              <ImprovementRoadmap 
                assessmentId={assessmentId}
                organizationId={assessment.assessment.organization_id}
                results={results}
                language={locale as 'hr' | 'en'}
                insights={insights}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'documents' && (
          <ErrorBoundary>
            <Suspense fallback={<CardSkeleton />}>
              <DocumentGenerationPanel assessmentId={assessmentId} securityLevel={assessment.assessment.security_level} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'export' && (
          <ErrorBoundary>
            <Suspense fallback={<CardSkeleton />}>
              <ExportPanel
                assessmentId={assessmentId}
                assessmentData={exportData!}
                results={results}
                gaps={(insights?.gaps as any) || []}
                recommendations={[]}
                language={locale as 'hr' | 'en'}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}