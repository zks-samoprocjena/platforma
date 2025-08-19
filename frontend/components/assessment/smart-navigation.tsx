'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { 
  LightBulbIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'
import type { AssessmentControl } from '@/types/assessment'

interface SmartNavigationProps {
  controls: AssessmentControl[]
  currentControlId: string | null
  onControlSelect: (controlId: string) => void
}

export function SmartNavigation({ controls, currentControlId, onControlSelect }: SmartNavigationProps) {
  const t = useTranslations('Assessment')

  // Smart ordering logic
  const getControlPriority = (control: AssessmentControl) => {
    let priority = 0
    
    // Higher priority for mandatory controls
    if (control.is_mandatory) priority += 100
    
    // Higher priority for unanswered controls
    if (!control.documentation_score && !control.implementation_score) priority += 50
    
    // Higher priority for partially answered controls
    if ((control.documentation_score && !control.implementation_score) || 
        (!control.documentation_score && control.implementation_score)) {
      priority += 75
    }
    
    // Lower priority for completed controls
    if (control.documentation_score && control.implementation_score) priority -= 25
    
    return priority
  }

  const sortedControls = [...controls]
    .filter(c => c.id !== currentControlId)
    .sort((a, b) => getControlPriority(b) - getControlPriority(a))
    .slice(0, 5)

  const getRecommendationReason = (control: AssessmentControl) => {
    if (control.is_mandatory && !control.documentation_score && !control.implementation_score) {
      return { text: 'Obavezna kontrola - nije ocjenjena', color: 'text-error', icon: ExclamationCircleIcon }
    }
    
    if ((control.documentation_score && !control.implementation_score) || 
        (!control.documentation_score && control.implementation_score)) {
      return { text: 'Djelomično ocjenjena', color: 'text-warning', icon: ExclamationCircleIcon }
    }
    
    if (control.is_mandatory) {
      return { text: 'Obavezna kontrola', color: 'text-info', icon: CheckCircleIcon }
    }
    
    return { text: 'Preporučeno za nastavak', color: 'text-base-content/70', icon: LightBulbIcon }
  }

  if (sortedControls.length === 0) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg border border-primary/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <LightBulbIcon className="h-5 w-5 text-primary" />
        <h4 className="font-semibold text-base-content">
          Preporučeni sljedeći koraci
        </h4>
      </div>
      
      <div className="space-y-2">
        {sortedControls.map((control) => {
          const recommendation = getRecommendationReason(control)
          const Icon = recommendation.icon
          
          return (
            <button
              key={control.id}
              onClick={() => onControlSelect(control.id)}
              className="w-full text-left p-3 bg-base-100 hover:bg-base-50 rounded-lg border border-base-200 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 ${recommendation.color}`} />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-base-content">
                      {control.code}
                    </span>
                    <span className={`badge badge-xs ${
                      control.is_mandatory ? 'badge-error' : 'badge-info'
                    }`}>
                      {control.is_mandatory ? 'Obavezno' : 'Dobrovoljno'}
                    </span>
                  </div>
                  
                  <p className="text-sm text-base-content/80 mb-1 line-clamp-2">
                    {control.name_hr}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${recommendation.color}`}>
                      {recommendation.text}
                    </span>
                    
                    <ArrowRightIcon className="h-3 w-3 text-base-content/40 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      
      <div className="mt-3 pt-3 border-t border-base-200">
        <p className="text-xs text-base-content/60">
          💡 Kontrole su poredane prema prioritetu: obavezne, djelomično ocijenjene, i preporučene
        </p>
      </div>
    </div>
  )
}