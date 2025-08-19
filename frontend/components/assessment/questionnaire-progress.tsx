'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import type { Assessment, AssessmentQuestionnaire } from '@/types/assessment'

interface QuestionnaireProgressProps {
  assessment: Assessment
  questionnaire: AssessmentQuestionnaire
  selectedMeasureId?: string | null
  onMeasureSelect?: (measureId: string) => void
}

export function QuestionnaireProgress({ assessment, questionnaire, selectedMeasureId, onMeasureSelect }: QuestionnaireProgressProps) {
  const t = useTranslations('Assessment')
  const [expandedMeasures, setExpandedMeasures] = useState<Set<string>>(new Set())
  
  const progress = assessment.progress
  
  // Calculate applicable controls (excluding non-applicable ones)
  let totalApplicableControls = 0
  let completedApplicableControls = 0
  let totalNonApplicableControls = 0
  
  questionnaire.measures.forEach(measure => {
    measure.submeasures.forEach(submeasure => {
      submeasure.controls.forEach(control => {
        if (control.minimum_score === null) {
          totalNonApplicableControls++
        } else {
          totalApplicableControls++
          if (control.documentation_score !== null && control.documentation_score !== undefined &&
              control.implementation_score !== null && control.implementation_score !== undefined) {
            completedApplicableControls++
          }
        }
      })
    })
  })
  
  // Use backend data as fallback if minimum_score field is not available
  const totalControls = totalApplicableControls > 0 ? totalApplicableControls : (progress?.total_controls || 0)
  const completedControls = totalApplicableControls > 0 ? completedApplicableControls : (progress?.answered_controls || progress?.completed_controls || 0)
  const mandatoryControls = progress?.mandatory_controls || 0
  const completedMandatory = progress?.mandatory_answered || progress?.completed_mandatory || 0
  
  // Calculate percentages - allow 0% when nothing is completed
  const overallPercentage = totalControls > 0 
    ? Math.round((completedControls / totalControls) * 100) 
    : 0
  const mandatoryPercentage = mandatoryControls > 0 
    ? Math.round((completedMandatory / mandatoryControls) * 100) 
    : 0

  // Calculate measure progress with submeasure support
  const measureProgress = (questionnaire.measures || []).map(measure => {
    // Count controls through submeasures
    let totalMeasureControls = 0
    let completedMeasureControls = 0
    
    // Calculate submeasure progress
    const submeasureProgress = measure.submeasures.map(submeasure => {
      // Filter out non-applicable controls (minimum_score === null)
      const applicableControls = submeasure.controls.filter(control => 
        control.minimum_score !== null
      )
      
      const totalSubControls = applicableControls.length
      const completedSubControls = applicableControls.filter(control => 
        control.documentation_score !== null && control.documentation_score !== undefined &&
        control.implementation_score !== null && control.implementation_score !== undefined
      ).length
      
      totalMeasureControls += totalSubControls
      completedMeasureControls += completedSubControls
      
      const percentage = totalSubControls > 0 
        ? Math.round((completedSubControls / totalSubControls) * 100) 
        : 0
      
      return {
        id: submeasure.id,
        code: submeasure.code,
        name: submeasure.name_hr,
        completed: completedSubControls,
        total: totalSubControls,
        totalWithNonApplicable: submeasure.controls.length,
        nonApplicableCount: submeasure.controls.length - totalSubControls,
        percentage
      }
    })
    
    const percentage = totalMeasureControls > 0 
      ? Math.round((completedMeasureControls / totalMeasureControls) * 100) 
      : 0
    
    return {
      id: measure.id,
      code: measure.code,
      name: measure.name_hr,
      completed: completedMeasureControls,
      total: totalMeasureControls,
      percentage,
      submeasures: submeasureProgress
    }
  })
  
  const toggleMeasureExpanded = (measureId: string) => {
    const newExpanded = new Set(expandedMeasures)
    if (newExpanded.has(measureId)) {
      newExpanded.delete(measureId)
    } else {
      newExpanded.add(measureId)
    }
    setExpandedMeasures(newExpanded)
  }

  return (
    <div className="bg-base-100 border-b border-base-300 px-6 py-2">
      {/* Overall Progress - Two Equal Sections */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        {/* Overall Progress */}
        <div className="bg-base-50 rounded-lg p-3 border border-base-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-base-content">
              {t('progress.overall')}
            </span>
            <span className="text-xs font-bold text-primary">
              {overallPercentage}%
            </span>
          </div>
          <div className="w-full bg-base-200 rounded-full h-2 mb-1">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${overallPercentage}%` }}
            />
          </div>
          <div className="text-xs text-base-content/70">
            {completedControls}/{totalControls} kontrola
            {totalNonApplicableControls > 0 && (
              <span className="text-base-content/50"> • {totalNonApplicableControls} nije primjenjivo</span>
            )}
          </div>
        </div>
        
        {/* Mandatory Progress */}
        <div className="bg-base-50 rounded-lg p-3 border border-base-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-base-content">
              Obavezne kontrole
            </span>
            <span className="text-xs font-bold text-warning">
              {mandatoryPercentage}%
            </span>
          </div>
          <div className="w-full bg-base-200 rounded-full h-2 mb-1">
            <div 
              className="bg-warning h-2 rounded-full transition-all duration-500"
              style={{ width: `${mandatoryPercentage}%` }}
            />
          </div>
          <div className="text-xs text-base-content/70">
            {completedMandatory}/{mandatoryControls} kontrola
          </div>
        </div>
      </div>

    </div>
  )
}