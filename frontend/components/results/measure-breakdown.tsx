'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Assessment, AssessmentResultsResponse, MeasureResultCompliance } from '@/types/assessment'
import ComplianceGauge from './compliance-gauge'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface MeasureBreakdownProps {
  assessment: Assessment
  results: AssessmentResultsResponse
}

export default function MeasureBreakdown({ assessment, results }: MeasureBreakdownProps) {
  const t = useTranslations('results.measures')
  const [expandedMeasures, setExpandedMeasures] = useState<Set<string>>(new Set())

  // Helper function to convert score to percentage and add missing fields
  const enhanceMeasure = (measure: MeasureResultCompliance) => {
    return {
      ...measure,
      measure_title: `Mjera ${measure.measure_code}`, // Croatian title
      compliance_percentage: measure.compliance_percentage || ((measure.overall_score / 5) * 100), // Use provided or calculate
      submeasure_count: measure.total_submeasures || 0, // Use API data
      control_count: measure.total_controls || 0, // Use API data
      answered_controls: measure.answered_controls || 0, // Use API data
      total_controls: measure.total_controls || 0, // Use API data
      avg_documentation_score: measure.documentation_avg || 0, // Use API data
      avg_implementation_score: measure.implementation_avg || 0, // Use API data
      mandatory_completed: measure.mandatory_answered || 0, // Use API data
      mandatory_total: measure.mandatory_controls || 0, // Use API data
      gap_areas: measure.critical_failures || [] // Use API data
    }
  }

  const toggleMeasure = (measureId: string) => {
    const newExpanded = new Set(expandedMeasures)
    if (newExpanded.has(measureId)) {
      newExpanded.delete(measureId)
    } else {
      newExpanded.add(measureId)
    }
    setExpandedMeasures(newExpanded)
  }

  const getComplianceColor = (percentage: number) => {
    if (percentage >= 90) return 'text-success'
    if (percentage >= 75) return 'text-info'
    if (percentage >= 60) return 'text-warning'
    return 'text-error'
  }

  const getComplianceBarColor = (percentage: number) => {
    if (percentage >= 90) return 'progress-success'
    if (percentage >= 75) return 'progress-info'
    if (percentage >= 60) return 'progress-warning'
    return 'progress-error'
  }

  return (
    <div className="card bg-base-100 shadow-lg">
      <div className="card-body">
        <h3 className="card-title mb-6">{t('title')}</h3>

        <div className="space-y-4">
          {results.measure_results?.map((measureData: MeasureResultCompliance) => {
            const measure = enhanceMeasure(measureData)
            return (
            <div key={measure.measure_id} className="border border-base-300 rounded-lg">
              {/* Measure Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-base-50 transition-colors"
                onClick={() => toggleMeasure(measure.measure_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {expandedMeasures.has(measure.measure_id) ? (
                      <ChevronDownIcon className="w-5 h-5 text-base-content/60" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-base-content/60" />
                    )}
                    
                    <div className="flex-1">
                      <h4 className="font-semibold text-base-content">
                        {measure.measure_title}
                      </h4>
                      <p className="text-sm text-base-content/70 mt-1">
                        {measure.submeasure_count} {t('submeasures')} • {measure.control_count} {t('controls')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Completion Status */}
                    <div className="text-right">
                      <div className="text-sm text-base-content/60">
                        {t('completion')}
                      </div>
                      <div className="font-medium">
                        {measure.answered_controls}/{measure.total_controls}
                      </div>
                    </div>

                    {/* Compliance Score */}
                    <div className="text-right min-w-[80px]">
                      <div className="text-sm text-base-content/60">
                        {t('compliance')}
                      </div>
                      <div className={`text-xl font-bold ${getComplianceColor(measure.compliance_percentage)}`}>
                        {measure.compliance_percentage.toFixed(1)}%
                      </div>
                    </div>

                    {/* Mini Gauge */}
                    <ComplianceGauge 
                      percentage={measure.compliance_percentage}
                      size="small"
                      showLabel={false}
                    />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <progress 
                    className={`progress w-full ${getComplianceBarColor(measure.compliance_percentage)}`}
                    value={measure.compliance_percentage} 
                    max="100"
                  />
                </div>
              </div>

              {/* Expanded Content */}
              {expandedMeasures.has(measure.measure_id) && (
                <div className="px-4 pb-4 border-t border-base-300 bg-base-50">
                  <div className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      {/* Statistics */}
                      <div className="bg-base-100 rounded-lg p-3">
                        <div className="text-sm text-base-content/60 mb-1">
                          {t('averageDocumentation')}
                        </div>
                        <div className="text-lg font-semibold">
                          {measure.avg_documentation_score?.toFixed(1) || 'N/A'}
                        </div>
                      </div>

                      <div className="bg-base-100 rounded-lg p-3">
                        <div className="text-sm text-base-content/60 mb-1">
                          {t('averageImplementation')}
                        </div>
                        <div className="text-lg font-semibold">
                          {measure.avg_implementation_score?.toFixed(1) || 'N/A'}
                        </div>
                      </div>

                      <div className="bg-base-100 rounded-lg p-3">
                        <div className="text-sm text-base-content/60 mb-1">
                          {t('mandatoryCompleted')}
                        </div>
                        <div className="text-lg font-semibold">
                          {measure.mandatory_completed}/{measure.mandatory_total}
                        </div>
                      </div>
                    </div>

                    {/* Gap Areas */}
                    {measure.gap_areas && measure.gap_areas.length > 0 && (
                      <div>
                        <h5 className="font-medium text-base-content mb-2">
                          {t('gapAreas')}
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {measure.gap_areas.map((gap, index) => (
                            <span 
                              key={index}
                              className="badge badge-warning badge-outline"
                            >
                              {gap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
          })}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t border-base-300">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-success">
                {results.measure_results?.filter(m => enhanceMeasure(m).compliance_percentage >= 90).length || 0}
              </div>
              <div className="text-sm text-base-content/70">
                {t('excellent')}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-info">
                {results.measure_results?.filter(m => {
                  const pct = enhanceMeasure(m).compliance_percentage
                  return pct >= 75 && pct < 90
                }).length || 0}
              </div>
              <div className="text-sm text-base-content/70">
                {t('good')}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-warning">
                {results.measure_results?.filter(m => {
                  const pct = enhanceMeasure(m).compliance_percentage
                  return pct >= 60 && pct < 75
                }).length || 0}
              </div>
              <div className="text-sm text-base-content/70">
                {t('moderate')}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-error">
                {results.measure_results?.filter(m => enhanceMeasure(m).compliance_percentage < 60).length || 0}
              </div>
              <div className="text-sm text-base-content/70">
                {t('needsImprovement')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}