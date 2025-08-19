'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { QuestionMarkCircleIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'

interface ControlDefinitionTooltipProps {
  control: {
    code: string
    name_hr: string
    description_hr?: string
  }
  catalogLink: string
}

export function ControlDefinitionTooltip({ 
  control, 
  catalogLink 
}: ControlDefinitionTooltipProps) {
  const t = useTranslations('Assessment')
  const [showTooltip, setShowTooltip] = useState(false)
  
  // Use first 150 chars of description as definition
  const definition = control.description_hr ? control.description_hr.slice(0, 150) + '...' : 'Nema dostupnog opisa za ovu kontrolu.'
  
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="text-base-content/50 hover:text-base-content transition-colors"
        aria-label={t('controls.showDefinition')}
      >
        <QuestionMarkCircleIcon className="h-5 w-5" />
      </button>
      
      {showTooltip && (
        <div className="absolute z-50 w-80 p-4 bg-base-100 rounded-lg shadow-xl border border-base-300 
                        left-8 top-0 animate-in fade-in slide-in-from-left-2">
          <div className="mb-2">
            <h5 className="font-semibold text-sm text-base-content mb-1">
              {control.code}: {control.name_hr}
            </h5>
            <p className="text-sm text-base-content/80">
              {definition}
            </p>
          </div>
          
          <Link 
            href={catalogLink}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-focus"
          >
            {t('controls.viewInCatalog')}
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}