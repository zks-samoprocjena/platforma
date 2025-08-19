'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { AIQAChat } from './ai-qa-chat'
import type { AssessmentControl } from '@/types/assessment'

interface AIControlChatProps {
  control: AssessmentControl
  assessmentId: string
  organizationId: string
  onClose: () => void
}

export function AIControlChat({ 
  control, 
  assessmentId, 
  organizationId, 
  onClose 
}: AIControlChatProps) {
  const t = useTranslations('AI')
  
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-3xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg">{t('chat.controlContext')}</h3>
            <p className="text-sm text-base-content/70">
              {control.name_hr} ({control.code})
            </p>
          </div>
          <button 
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        
        {/* Chat Component */}
        <div className="flex-1 overflow-hidden">
          <AIQAChat
            assessmentId={assessmentId}
            organizationId={organizationId}
            controlId={control.id}
            className="h-full"
          />
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}