'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LightBulbIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { useAIRecommendations } from '@/hooks/api/use-ai'

interface AIRecommendationsInlineProps {
  assessmentId: string
  organizationId: string
  controlId: string
  maxRecommendations?: number
}

export function AIRecommendationsInline({ 
  assessmentId, 
  organizationId,
  controlId,
  maxRecommendations = 3
}: AIRecommendationsInlineProps) {
  const t = useTranslations('AI')
  const [isExpanded, setIsExpanded] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  
  const { data, isLoading } = useAIRecommendations(
    assessmentId, 
    organizationId,
    { enabled: shouldLoad && !!assessmentId && !!organizationId }
  )
  
  // Filter for this control - data contains { recommendations, metadata, summary, total_gaps }
  const controlRecommendations = data?.recommendations
    ?.filter(rec => rec.control_ids?.includes(controlId))
    ?.slice(0, maxRecommendations) || []
  
  if (isLoading || controlRecommendations.length === 0) {
    return null
  }
  
  return (
    <div className="border border-base-300 rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-base-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <LightBulbIcon className="h-5 w-5 text-secondary" />
          <span className="font-medium text-sm text-base-content">
            {t('recommendations.topRecommendations')} ({controlRecommendations.length})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="h-4 w-4 text-base-content/70" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
        )}
      </button>
      
      {isExpanded && (
        <div className="border-t border-base-200 p-3 space-y-2">
          {controlRecommendations.map((rec, index) => (
            <div key={index} className="bg-base-50 rounded p-3">
              <h5 className="font-medium text-sm mb-1">{rec.title}</h5>
              <p className="text-xs text-base-content/70">{rec.description}</p>
              {rec.compliance_impact && (
                <span className="text-xs text-success mt-1 inline-block">
                  +{rec.compliance_impact}% compliance
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}