'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { 
  LightBulbIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { useAIRecommendations } from '@/hooks/api/use-ai'

interface AIRecommendationsPanelProps {
  assessmentId: string
  organizationId: string
  controlId?: string
  className?: string
}

export function AIRecommendationsPanel({ 
  assessmentId, 
  organizationId,
  controlId, 
  className = '' 
}: AIRecommendationsPanelProps) {
  const t = useTranslations('AI')

  // Early return if required props are missing
  if (!assessmentId || !organizationId) {
    return (
      <div className={`bg-base-100 rounded-lg shadow-sm border border-base-300 p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <LightBulbIcon className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-base-content">{t('recommendations.title')}</h3>
        </div>
        <p className="text-sm text-base-content/70">
          {t('recommendations.loading')}
        </p>
      </div>
    )
  }

  // Get AI recommendations for the assessment
  const { data, isLoading } = useAIRecommendations(
    assessmentId, 
    organizationId,
    { enabled: !!assessmentId && !!organizationId }
  )

  // Filter recommendations for specific control if provided
  const filteredRecommendations = data?.recommendations?.filter(rec => 
    !controlId || rec.control_ids?.includes(controlId)
  ) || []

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical':
      case 'high':
        return <ExclamationTriangleIcon className="h-4 w-4 text-error" />
      case 'medium':
        return <ClockIcon className="h-4 w-4 text-warning" />
      case 'low':
        return <CheckCircleIcon className="h-4 w-4 text-success" />
      default:
        return <LightBulbIcon className="h-4 w-4 text-info" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
      case 'high':
        return 'border-error/20 bg-error/5'
      case 'medium':
        return 'border-warning/20 bg-warning/5'
      case 'low':
        return 'border-success/20 bg-success/5'
      default:
        return 'border-info/20 bg-info/5'
    }
  }

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'critical':
        return t('recommendations.criticalPriority')
      case 'high':
        return t('recommendations.highPriority')
      case 'medium':
        return t('recommendations.mediumPriority')
      case 'low':
        return t('recommendations.lowPriority')
      default:
        return t('recommendations.generalPriority')
    }
  }

  if (isLoading) {
    return (
      <div className={`bg-base-100 rounded-lg shadow-sm border border-base-300 p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-secondary/10 rounded-lg">
            <LightBulbIcon className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h3 className="font-semibold text-base-content">
              {t('recommendations.title')}
            </h3>
            <p className="text-sm text-base-content/70">
              {t('recommendations.loading')}
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-base-200 rounded-lg p-4">
              <div className="skeleton h-4 w-3/4 mb-2"></div>
              <div className="skeleton h-3 w-full mb-1"></div>
              <div className="skeleton h-3 w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!recommendations || filteredRecommendations.length === 0) {
    return (
      <div className={`bg-base-100 rounded-lg shadow-sm border border-base-300 p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-secondary/10 rounded-lg">
            <LightBulbIcon className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h3 className="font-semibold text-base-content">
              {t('recommendations.title')}
            </h3>
            <p className="text-sm text-base-content/70">
              {t('recommendations.noRecommendations')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-base-100 rounded-lg shadow-sm border border-base-300 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-secondary/10 rounded-lg">
          <LightBulbIcon className="h-5 w-5 text-secondary" />
        </div>
        <div>
          <h3 className="font-semibold text-base-content">
            {t('recommendations.title')}
          </h3>
          <p className="text-sm text-base-content/70">
            {filteredRecommendations.length} {t('recommendations.available')}
          </p>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {filteredRecommendations.map((recommendation, index) => (
          <div 
            key={index}
            className={`border rounded-lg p-4 ${getPriorityColor(recommendation.priority)}`}
          >
            {/* Recommendation Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {getPriorityIcon(recommendation.priority)}
                <span className="text-sm font-medium text-base-content">
                  {getPriorityLabel(recommendation.priority)}
                </span>
              </div>
              
              {recommendation.effort_estimate && (
                <div className="text-xs text-base-content/60 bg-base-100 px-2 py-1 rounded">
                  {t(`effort.${recommendation.effort_estimate}`)}
                </div>
              )}
            </div>

            {/* Recommendation Content */}
            <div className="mb-3">
              <h4 className="font-medium text-base-content mb-2">
                {recommendation.title}
              </h4>
              <p className="text-sm text-base-content/80 mb-2">
                {recommendation.description}
              </p>
              
              {recommendation.implementation_steps && recommendation.implementation_steps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-base-content/70 mb-2">
                    {t('recommendations.implementationSteps')}:
                  </p>
                  <ol className="list-decimal list-inside text-xs text-base-content/70 space-y-1 ml-2">
                    {recommendation.implementation_steps.map((step, stepIndex) => (
                      <li key={stepIndex}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Recommendation Footer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-base-content/60">
                {recommendation.category && (
                  <span>
                    {t('recommendations.category')}: {recommendation.category}
                  </span>
                )}
                
                {recommendation.compliance_impact && (
                  <span>
                    {t('recommendations.impact')}: +{recommendation.compliance_impact}%
                  </span>
                )}
              </div>
              
              <button className="btn btn-xs btn-outline btn-secondary gap-1">
                {t('recommendations.viewDetails')}
                <ChevronRightIcon className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {filteredRecommendations.length > 3 && (
        <div className="mt-6 pt-4 border-t border-base-200">
          <div className="text-center">
            <button className="btn btn-sm btn-outline btn-secondary">
              {t('recommendations.viewAll')} ({filteredRecommendations.length})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}