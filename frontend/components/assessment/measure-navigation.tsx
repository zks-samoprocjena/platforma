'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { 
  ChevronDownIcon, 
  ChevronRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline'
import type { AssessmentMeasure, AssessmentControl } from '@/types/assessment'

interface MeasureNavigationProps {
  measures: AssessmentMeasure[]
  selectedMeasureId: string | null
  selectedControlId: string | null
  onMeasureSelect: (measureId: string) => void
  onControlSelect: (controlId: string) => void
}

export function MeasureNavigation({ 
  measures, 
  selectedMeasureId, 
  selectedControlId,
  onMeasureSelect,
  onControlSelect
}: MeasureNavigationProps) {
  const t = useTranslations('Assessment')
  const [expandedMeasures, setExpandedMeasures] = useState<Set<string>>(
    new Set(selectedMeasureId ? [selectedMeasureId] : [])
  )

  const toggleMeasure = (measureId: string) => {
    const newExpanded = new Set(expandedMeasures)
    if (newExpanded.has(measureId)) {
      newExpanded.delete(measureId)
    } else {
      newExpanded.add(measureId)
    }
    setExpandedMeasures(newExpanded)
  }

  const getMeasureProgress = (measure: AssessmentMeasure) => {
    // Get all controls from all submeasures
    const allControls = measure.submeasures.flatMap(submeasure => submeasure.controls)
    const total = allControls.length
    const completed = allControls.filter(control => 
      control.documentation_score !== null && control.implementation_score !== null
    ).length
    
    return { 
      completed, 
      total, 
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0 
    }
  }

  const getControlStatus = (control: AssessmentControl) => {
    if (control.documentation_score !== null && control.implementation_score !== null) {
      return 'completed'
    }
    if (control.documentation_score !== null || control.implementation_score !== null) {
      return 'in_progress'
    }
    return 'not_started'
  }

  const getControlIcon = (status: string, isMandatory: boolean) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4 text-success" />
      case 'in_progress':
        return <ClockIcon className="h-4 w-4 text-warning" />
      default:
        return isMandatory 
          ? <ExclamationCircleIcon className="h-4 w-4 text-error" />
          : <div className="h-4 w-4 rounded-full border border-base-300" />
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-base-content mb-4">
        Mjere sigurnosti
      </h2>
      
      <div className="space-y-2">
        {measures.map((measure, index) => {
          const progress = getMeasureProgress(measure)
          const isExpanded = expandedMeasures.has(measure.id)
          const isSelected = selectedMeasureId === measure.id
          
          return (
            <div key={measure.id} className="border border-base-300 rounded-lg overflow-hidden">
              {/* Measure Header */}
              <button
                onClick={() => {
                  toggleMeasure(measure.id)
                  onMeasureSelect(measure.id)
                }}
                className={`w-full p-3 text-left transition-colors ${
                  isSelected ? 'bg-primary/10 border-primary' : 'bg-base-100 hover:bg-base-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4 text-base-content/70" />
                    )}
                    <span className="text-sm font-medium text-primary">
                      M{index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-base-content/70">
                      {progress.completed}/{progress.total}
                    </span>
                    <div className={`w-6 h-1 rounded-full ${
                      progress.percentage === 100 
                        ? 'bg-success' 
                        : progress.percentage > 0 
                        ? 'bg-warning' 
                        : 'bg-base-300'
                    }`}>
                      <div 
                        className="h-full rounded-full bg-current transition-all duration-300"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
                
                <h3 className="text-sm font-medium text-base-content mt-1 line-clamp-2">
                  {measure.name_hr}
                </h3>
                
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-base-content/60">
                    {measure.submeasures.flatMap(s => s.controls).length} kontrola
                  </span>
                  <span className={`text-xs font-medium ${
                    progress.percentage === 100 
                      ? 'text-success' 
                      : progress.percentage > 0 
                      ? 'text-warning' 
                      : 'text-base-content/60'
                  }`}>
                    {progress.percentage}%
                  </span>
                </div>
              </button>

              {/* Controls List */}
              {isExpanded && measure.submeasures && (
                <div className="border-t border-base-300">
                  {measure.submeasures.flatMap((submeasure, submeasureIndex) =>
                    submeasure.controls.map((control, controlIndex) => {
                    const status = getControlStatus(control)
                    const isControlSelected = selectedControlId === control.id
                    
                    return (
                      <button
                        key={`${submeasure.id}-${control.id}`}
                        onClick={() => onControlSelect(control.id)}
                        className={`w-full p-3 text-left border-b border-base-200 last:border-b-0 transition-colors ${
                          isControlSelected 
                            ? 'bg-primary/5 border-l-4 border-l-primary' 
                            : 'hover:bg-base-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {getControlIcon(status, control.is_mandatory)}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-base-content/70">
                                {submeasure.code}.{controlIndex + 1}
                              </span>
                              {control.is_mandatory && (
                                <span className="badge badge-error badge-xs">
                                  {t('controls.mandatory')}
                                </span>
                              )}
                            </div>
                            
                            <p className="text-sm text-base-content line-clamp-2">
                              {control.name_hr}
                            </p>
                            
                            {(control.documentation_score !== null || control.implementation_score !== null) && (
                              <div className="flex items-center gap-2 mt-1">
                                {control.documentation_score !== null && (
                                  <span className="text-xs text-base-content/60">
                                    D: {control.documentation_score}
                                  </span>
                                )}
                                {control.implementation_score !== null && (
                                  <span className="text-xs text-base-content/60">
                                    I: {control.implementation_score}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}