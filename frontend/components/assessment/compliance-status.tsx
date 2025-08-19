'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { 
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import type { ComplianceResult } from '@/types/assessment'
import { useAssessmentCompliance } from '@/hooks/api/use-assessments'

interface ComplianceStatusProps {
  compliance?: ComplianceResult
  assessmentId?: string
  className?: string
}

export function ComplianceStatus({ compliance: propCompliance, assessmentId, className = '' }: ComplianceStatusProps) {
  const t = useTranslations('Assessment')
  
  // Use hook if assessmentId is provided, otherwise use prop
  const { data: apiCompliance, isLoading } = useAssessmentCompliance(assessmentId || '', !!assessmentId)
  const compliance = propCompliance || apiCompliance
  
  if (isLoading) {
    return (
      <div className={`bg-base-100 rounded-lg shadow-sm border border-base-300 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-base-200 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-base-200 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-base-200 rounded"></div>
            <div className="h-16 bg-base-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }
  
  if (!compliance) return null
  
  const getStatusIcon = () => {
    if (compliance.passes_compliance) {
      return <CheckCircleIcon className="h-8 w-8 text-success" />
    } else if (compliance.compliance_percentage >= 50) {
      return <ExclamationTriangleIcon className="h-8 w-8 text-warning" />
    } else {
      return <XCircleIcon className="h-8 w-8 text-error" />
    }
  }
  
  const getStatusText = () => {
    const percentage = compliance.compliance_percentage || 0
    if (compliance.passes_compliance) {
      return 'Potpuno usklađeno'
    } else if (percentage >= 80) {
      return 'Visoka usklađenost'
    } else if (percentage >= 50) {
      return 'Djelomična usklađenost'
    } else {
      return 'Niska usklađenost'
    }
  }
  
  const getStatusColor = () => {
    const percentage = compliance.compliance_percentage || 0
    if (compliance.passes_compliance) {
      return 'text-success'
    } else if (percentage >= 50) {
      return 'text-warning'
    } else {
      return 'text-error'
    }
  }
  
  return (
    <div className={`bg-base-100 rounded-lg shadow-sm border border-base-300 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-base-content">
          Status usklađenosti
        </h3>
        {getStatusIcon()}
      </div>
      
      {/* Overall Score */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-base-content/70">Ukupna ocjena usklađenosti</span>
          <span className={`text-3xl font-bold ${getStatusColor()}`}>
            {(compliance.overall_compliance_score || compliance.overall_score || 0).toFixed(2)}
          </span>
        </div>
        
        <div className="w-full bg-base-200 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all duration-500 ${
              compliance.passes_compliance ? 'bg-success' : 
              (compliance.compliance_percentage || 0) >= 50 ? 'bg-warning' : 'bg-error'
            }`}
            style={{ width: `${compliance.compliance_percentage || 0}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-base-content/60">0</span>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          <span className="text-xs text-base-content/60">5</span>
        </div>
      </div>
      
      {/* Compliance Details */}
      <div className="space-y-4">
        {/* Measures Progress */}
        <div className="bg-base-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-base-content">
              Mjere koje zadovoljavaju
            </span>
            <span className="text-sm font-bold text-base-content">
              {compliance.passed_measures || 0}/{compliance.total_measures || 0}
            </span>
          </div>
          <div className="w-full bg-base-200 rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${(compliance.total_measures > 0 ? (compliance.passed_measures / compliance.total_measures) * 100 : 0)}%` }}
            />
          </div>
        </div>
        
        {/* Security Level Info */}
        <div className="bg-base-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <InformationCircleIcon className="h-5 w-5 text-info" />
            <span className="text-sm font-medium text-base-content">
              Pragovi za {compliance.security_level || 'osnovnu'} razinu
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-base-content/70">Pojedinačno:</span>
              <span className="ml-2 font-medium">≥ {compliance.thresholds?.individual || 3}</span>
            </div>
            <div>
              <span className="text-base-content/70">Prosjek:</span>
              <span className="ml-2 font-medium">≥ {compliance.thresholds?.average || 3}</span>
            </div>
          </div>
        </div>
        
        {/* Maturity Score */}
        <div className="bg-base-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ChartBarIcon className="h-5 w-5 text-secondary" />
            <span className="text-sm font-medium text-base-content">
              Ocjena zrelosti
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-base-content/70">Trenutno:</span>
              <span className="ml-2 font-bold text-base-content">
                {compliance.maturity_score || 0}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-base-content/70">Prag:</span>
              <span className="ml-2 font-medium text-base-content">
                {compliance.maturity_threshold || 3}
              </span>
            </div>
          </div>
          <div className="w-full bg-base-200 rounded-full h-2 mt-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${
                compliance.meets_maturity_trend ? 'bg-success' : 'bg-warning'
              }`}
              style={{ width: `${Math.min(((compliance.maturity_score || 0) / (compliance.maturity_threshold || 3)) * 100, 100)}%` }}
            />
          </div>
          {!compliance.meets_maturity_trend && (
            <p className="text-xs text-warning mt-2">
              Potrebno još {(compliance.maturity_threshold || 3) - (compliance.maturity_score || 0)} kontrola za trend zrelosti
            </p>
          )}
        </div>
      </div>
      
      {/* Status Summary */}
      <div className={`mt-6 p-4 rounded-lg ${
        compliance.passes_compliance ? 'bg-success/10' : 'bg-warning/10'
      }`}>
        <p className={`text-sm font-medium ${
          compliance.passes_compliance ? 'text-success' : 'text-warning'
        }`}>
          {compliance.passes_compliance ? 
            'Vaša organizacija zadovoljava sve zahtjeve usklađenosti.' :
            'Potrebna su dodatna poboljšanja za potpunu usklađenost.'}
        </p>
      </div>
    </div>
  )
}