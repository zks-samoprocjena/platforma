'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useAssessmentCompliance } from '@/hooks/api/use-assessments'
import { 
  CheckCircleIcon, 
  XCircleIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CogIcon
} from '@heroicons/react/24/outline'

interface ComplianceLiveStatusProps {
  assessmentId: string
  securityLevel: string
}

export function ComplianceLiveStatus({ assessmentId, securityLevel }: ComplianceLiveStatusProps) {
  const t = useTranslations('Assessment')
  const { data: compliance, isLoading, error } = useAssessmentCompliance(assessmentId)

  if (isLoading) {
    return (
      <div className="bg-base-100 rounded-lg p-6 shadow-sm border border-base-300">
        <div className="flex items-center gap-3">
          <span className="loading loading-spinner loading-sm"></span>
          <span className="text-base-content/70">Učitavanje statusa usklađenosti...</span>
        </div>
      </div>
    )
  }

  if (error || !compliance) {
    return (
      <div className="alert alert-error">
        <XCircleIcon className="h-5 w-5" />
        <span>Greška pri učitavanju statusa usklađenosti</span>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
        return <CheckCircleIcon className="h-5 w-5 text-success" />
      case 'non_compliant':
        return <XCircleIcon className="h-5 w-5 text-error" />
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-warning" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'text-success'
      case 'non_compliant':
        return 'text-error'
      default:
        return 'text-warning'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'Usklađeno'
      case 'non_compliant':
        return 'Neusklađeno'
      default:
        return 'U tijeku'
    }
  }

  return (
    <div className="space-y-6">
      {/* Overall Compliance Status */}
      <div className="bg-base-100 rounded-lg p-6 shadow-sm border border-base-300">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Status usklađenosti</h3>
          <div className={`flex items-center gap-2 ${getStatusColor(compliance.overall?.passes_compliance ? 'compliant' : 'non_compliant')}`}>
            {getStatusIcon(compliance.overall?.passes_compliance ? 'compliant' : 'non_compliant')}
            <span className="font-medium">{getStatusText(compliance.overall?.passes_compliance ? 'compliant' : 'non_compliant')}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Score Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Ukupna ocjena:</span>
              <span className="font-medium">{(compliance.overall?.overall_score || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Ocjena zrelosti:</span>
              <span className="font-medium">{(compliance.overall?.maturity_score || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Prošle mjere:</span>
              <span className="font-medium">{compliance.overall?.passed_measures || 0}/{compliance.overall?.total_measures || 0}</span>
            </div>
          </div>

          {/* Progress Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Usklađene podmjere:</span>
              <span className="font-medium">
                {compliance.passed_submeasures}/{compliance.total_submeasures}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Usklađene mjere:</span>
              <span className="font-medium">
                {compliance.passed_measures}/{compliance.total_measures}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Postotak usklađenosti:</span>
              <span className="font-medium">{(compliance.overall?.compliance_percentage || 0).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Maturity Score */}
        {compliance.maturity_score > 0 && (
          <div className="mt-4 p-3 bg-base-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Ocjena zrelosti:</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{compliance.overall?.maturity_score || 0}</span>
                <span className="text-sm text-base-content/50">/ 100</span>
                {(compliance.overall?.maturity_score || 0) >= 80 && (
                  <CheckCircleIcon className="h-4 w-4 text-success" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Measure Compliance Details */}
      <div className="bg-base-100 rounded-lg p-6 shadow-sm border border-base-300">
        <h3 className="text-lg font-semibold mb-4">Usklađenost po mjerama</h3>
        
        <div className="space-y-3">
          {(compliance.measures || []).map((measure) => (
            <div key={measure.measure_id} className="border border-base-300 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    measure.passes_compliance ? 'bg-success/10' : 'bg-error/10'
                  }`}>
                    {measure.passes_compliance ? (
                      <CheckCircleIcon className="h-5 w-5 text-success" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-error" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm text-base-content/70">M{measure.measure_code}</span>
                    <h4 className="font-medium">Mjera {measure.measure_code}</h4>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm text-base-content/70">Podmjere:</span>
                  <p className="font-medium">
                    {(measure.submeasures || []).filter(sub => sub.passes_overall).length}/{(measure.submeasures || []).length}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submeasure Compliance Details */}
      <div className="bg-base-100 rounded-lg p-6 shadow-sm border border-base-300">
        <h3 className="text-lg font-semibold mb-4">Detaljan pregled podmjera</h3>
        
        <div className="space-y-4">
          {(compliance.measures || [])
            .flatMap(measure => measure.submeasures || [])
            .filter(sub => !sub.passes_overall)
            .map((submeasure) => (
              <div key={submeasure.submeasure_id} className="border border-error/30 rounded-lg p-4 bg-error/5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-sm text-base-content/70">{submeasure.submeasure_code}</span>
                    <h4 className="font-medium">{submeasure.submeasure_name}</h4>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-base-content/70">Prosjek: {(submeasure.overall_score || 0).toFixed(2)}</p>
                    <p className={submeasure.passes_overall ? 'text-success' : 'text-error'}>
                      {submeasure.passes_overall ? 'Sve kontrole prolaze' : 'Ima kontrola ispod praga'}
                    </p>
                  </div>
                </div>

                {/* Failed Controls - TODO: Add when API provides control-level details */}
                {submeasure.critical_failures && submeasure.critical_failures.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-error">Kritične greške:</p>
                    <div className="text-sm text-error">
                      {submeasure.critical_failures.join(', ')}
                    </div>
                  </div>
                )}
              </div>
          ))}
        </div>
      </div>
    </div>
  )
}