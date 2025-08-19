'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { 
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline'
import type { MeasureResultCompliance, SubmeasureResult } from '@/types/assessment'

interface ComplianceDetailsProps {
  measures: MeasureResultCompliance[]
  submeasures: SubmeasureResult[]
  securityLevel: string
}

export function ComplianceDetails({ measures, submeasures, securityLevel }: ComplianceDetailsProps) {
  const t = useTranslations('results')
  const [expandedMeasures, setExpandedMeasures] = useState<Set<string>>(new Set())
  
  // Safe defaults
  const safeMeasures = measures || []
  const safeSubmeasures = submeasures || []
  
  const toggleMeasure = (measureId: string) => {
    const newExpanded = new Set(expandedMeasures)
    if (newExpanded.has(measureId)) {
      newExpanded.delete(measureId)
    } else {
      newExpanded.add(measureId)
    }
    setExpandedMeasures(newExpanded)
  }
  
  const getSubmeasuresForMeasure = (measureCode: string) => {
    return safeSubmeasures.filter(sub => sub.submeasure_code?.startsWith(measureCode + '.'))
  }
  
  return (
    <div className="bg-base-100 rounded-lg shadow-sm border border-base-300 p-6">
      <h3 className="text-lg font-semibold text-base-content mb-4">
        {t('compliance.detailsByMeasures')}
      </h3>
      
      <div className="space-y-3">
        {safeMeasures.map((measure) => {
          const measureSubmeasures = getSubmeasuresForMeasure(measure.measure_code || '')
          const isExpanded = expandedMeasures.has(measure.measure_id || '')
          
          // Calculate submeasure counts from filtered data
          const totalSubmeasures = measureSubmeasures.length
          const passedSubmeasures = measureSubmeasures.filter(sub => sub.passes_overall).length
          
          return (
            <div key={measure.measure_id} className="border border-base-300 rounded-lg">
              {/* Measure Header */}
              <div 
                className={`p-4 cursor-pointer hover:bg-base-50 transition-colors ${
                  measure.passes_compliance ? 'bg-success/5' : 'bg-error/5'
                }`}
                onClick={() => toggleMeasure(measure.measure_id || '')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button className="p-1">
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-base-content/70" />
                      )}
                    </button>
                    
                    {measure.passes_compliance ? (
                      <CheckCircleIcon className="h-5 w-5 text-success" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-error" />
                    )}
                    
                    <div>
                      <span className="font-medium text-base-content">
                        Mjera {measure.measure_code || 'N/A'}
                      </span>
                      <span className="ml-2 text-sm text-base-content/70">
                        {passedSubmeasures}/{totalSubmeasures} podmjera zadovoljava
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className={`text-lg font-bold ${
                      measure.passes_compliance ? 'text-success' : 'text-error'
                    }`}>
                      {(measure.overall_score || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {(measure.critical_failures || []).length > 0 && (
                  <div className="mt-2 text-sm text-error">
                    <ExclamationCircleIcon className="h-4 w-4 inline mr-1" />
                    Neuspješne podmjere: {(measure.critical_failures || []).join(', ')}
                  </div>
                )}
              </div>
              
              {/* Submeasures (Expandable) */}
              {isExpanded && (
                <div className="border-t border-base-200 bg-base-50">
                  {measureSubmeasures.map((submeasure) => (
                    <div 
                      key={submeasure.submeasure_id || Math.random()}
                      className={`px-12 py-3 border-b border-base-100 last:border-0 ${
                        submeasure.passes_overall ? 'bg-success/5' : 'bg-error/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {submeasure.passes_overall ? (
                            <CheckCircleIcon className="h-4 w-4 text-success" />
                          ) : (
                            <XCircleIcon className="h-4 w-4 text-error" />
                          )}
                          
                          <div>
                            <span className="text-sm font-medium text-base-content">
                              Podmjera {submeasure.submeasure_code || 'N/A'}
                            </span>
                            <div className="text-xs text-base-content/60 mt-1">
                              {submeasure.mandatory_controls || submeasure.mandatory_controls_count || 0} obaveznih kontrola
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6 text-sm">
                          {/* Documentation Score */}
                          <div>
                            <span className="text-base-content/60">Dok:</span>
                            <span className={`ml-1 font-medium ${
                              (submeasure.documentation_avg || 0) >= getThresholds(securityLevel).average ? 
                              'text-success' : 'text-warning'
                            }`}>
                              {(submeasure.documentation_avg || 0).toFixed(2)}
                            </span>
                          </div>
                          
                          {/* Implementation Score */}
                          <div>
                            <span className="text-base-content/60">Impl:</span>
                            <span className={`ml-1 font-medium ${
                              (submeasure.implementation_avg || 0) >= getThresholds(securityLevel).average ? 
                              'text-success' : 'text-warning'
                            }`}>
                              {(submeasure.implementation_avg || 0).toFixed(2)}
                            </span>
                          </div>
                          
                          {/* Overall Score */}
                          <div>
                            <span className="text-base-content/60">Ukupno:</span>
                            <span className={`ml-1 font-bold ${
                              submeasure.passes_overall ? 'text-success' : 'text-error'
                            }`}>
                              {(submeasure.overall_score || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Compliance Status */}
                      <div className="mt-2 text-xs">
                        <span className={`${
                          submeasure.passes_individual_threshold ? 'text-success' : 'text-error'
                        }`}>
                          {submeasure.passes_individual_threshold ? '✓' : '✗'} Pojedinačni prag
                        </span>
                        <span className="mx-2">•</span>
                        <span className={`${
                          submeasure.passes_average_threshold ? 'text-success' : 'text-error'
                        }`}>
                          {submeasure.passes_average_threshold ? '✓' : '✗'} Prosjek prag
                        </span>
                        
                        {(submeasure.failed_controls || []).length > 0 && (
                          <div className="mt-1 text-error">
                            Kontrole ispod praga: {(submeasure.failed_controls || []).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Helper function
function getThresholds(securityLevel: string) {
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