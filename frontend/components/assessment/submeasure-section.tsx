'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { 
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  CogIcon
} from '@heroicons/react/24/outline'
import { ControlCard } from './control-card'
import type { AssessmentSubmeasure } from '@/types/assessment'

interface SubmeasureSectionProps {
  submeasure: AssessmentSubmeasure
  assessmentId: string
  organizationId: string
  measureName: string
  securityLevel: string
}

export function SubmeasureSection({ 
  submeasure, 
  assessmentId, 
  organizationId, 
  measureName,
  securityLevel 
}: SubmeasureSectionProps) {
  const t = useTranslations('Assessment')
  const [isExpanded, setIsExpanded] = useState(true)
  
  // Calculate compliance status
  const hasScores = submeasure.documentation_avg !== null && submeasure.implementation_avg !== null
  const overallScore = submeasure.overall_score || 0
  
  // Get thresholds based on security level
  const getThresholds = () => {
    switch (securityLevel) {
      case 'osnovna':
        return { individual: 2.0, average: 2.5 }
      case 'srednja':
        return { individual: 2.5, average: 3.0 }
      case 'napredna':
        return { individual: 3.0, average: 3.5 }
      default:
        return { individual: 2.0, average: 2.5 }
    }
  }
  
  const thresholds = getThresholds()
  
  // Check which controls fail the individual threshold
  const failedControls = submeasure.controls.filter(control => {
    if (!control.documentation_score || !control.implementation_score) return false
    const controlScore = (control.documentation_score + control.implementation_score) / 2
    return controlScore < thresholds.individual
  })
  
  const getComplianceStatus = () => {
    if (!hasScores) return null
    
    const allControlsAboveThreshold = failedControls.length === 0
    const averageAboveThreshold = overallScore >= thresholds.average
    
    if (allControlsAboveThreshold && averageAboveThreshold) {
      return { status: 'compliant', color: 'text-success', bg: 'bg-success/10' }
    } else if (overallScore >= thresholds.individual) {
      return { status: 'partial', color: 'text-warning', bg: 'bg-warning/10' }
    } else {
      return { status: 'non-compliant', color: 'text-error', bg: 'bg-error/10' }
    }
  }
  
  const complianceStatus = getComplianceStatus()
  
  return (
    <div className="bg-base-100 rounded-lg shadow-sm border border-base-300 mb-4">
      {/* Submeasure Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-base-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          {/* Expand/Collapse Icon */}
          <div className="mt-1">
            {isExpanded ? (
              <ChevronDownIcon className="h-5 w-5 text-base-content/70" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-base-content/70" />
            )}
          </div>
          
          {/* Submeasure Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-base-content/70">
                Podmjera {submeasure.code}
              </span>
              
              {/* Compliance Badge */}
              {complianceStatus && (
                <span className={`text-xs px-2 py-1 rounded ${complianceStatus.bg} ${complianceStatus.color}`}>
                  {complianceStatus.status === 'compliant' ? 'Usklađeno' : 
                   complianceStatus.status === 'partial' ? 'Djelomično usklađeno' : 
                   'Neusklađeno'}
                </span>
              )}
            </div>
            
            <h3 className="text-lg font-semibold text-base-content mb-2">
              {submeasure.name_hr}
            </h3>
            
            {submeasure.description_hr && (
              <p className="text-sm text-base-content/70 mb-3">
                {submeasure.description_hr}
              </p>
            )}
            
            {/* Progress and Stats */}
            <div className="flex flex-wrap items-center gap-6 text-sm">
              {/* Progress */}
              <div className="flex items-center gap-2">
                <span className="text-base-content/70">Napredak:</span>
                <span className="font-medium">
                  {submeasure.answered_controls}/{submeasure.total_controls} kontrola
                </span>
                <span className="text-base-content/50">
                  ({Math.round((submeasure.answered_controls / submeasure.total_controls) * 100)}%)
                </span>
              </div>
              
              {/* Mandatory Status */}
              <div className="flex items-center gap-2">
                <ExclamationCircleIcon className="h-4 w-4 text-error" />
                <span className="text-base-content/70">Obavezne:</span>
                <span className="font-medium">
                  {submeasure.mandatory_answered}/{submeasure.mandatory_controls}
                </span>
              </div>
              
              {/* Scores */}
              {hasScores && (
                <>
                  <div className="flex items-center gap-2">
                    <DocumentTextIcon className="h-4 w-4 text-primary" />
                    <span className="text-base-content/70">Dokumentacija:</span>
                    <span className="font-medium">
                      {submeasure.documentation_avg?.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <CogIcon className="h-4 w-4 text-secondary" />
                    <span className="text-base-content/70">Implementacija:</span>
                    <span className="font-medium">
                      {submeasure.implementation_avg?.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="h-4 w-4 text-info" />
                    <span className="text-base-content/70">Ukupno:</span>
                    <span className="font-medium">
                      {overallScore.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
            
            {/* Threshold Info */}
            {hasScores && (
              <div className="mt-3 text-xs text-base-content/60">
                <span>Pragovi za {securityLevel} razinu: </span>
                <span>Pojedinačno ≥ {thresholds.individual}, </span>
                <span>Prosjek ≥ {thresholds.average}</span>
                {failedControls.length > 0 && (
                  <span className="text-error ml-2">
                    ({failedControls.length} kontrola ispod praga)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Controls List */}
      {isExpanded && (
        <div className="border-t border-base-300">
          <div className="p-4 space-y-4">
            {submeasure.controls.map((control) => (
              <ControlCard
                key={`${control.id}-${submeasure.id}`}
                control={control}
                assessmentId={assessmentId}
                organizationId={organizationId}
                measureName={`${measureName} - ${submeasure.name_hr}`}
                submeasureId={submeasure.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}