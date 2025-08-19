'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCreateAssessment } from '@/hooks/api/use-assessments'
import { SecurityLevel } from '@/types/assessment'
import { X } from 'lucide-react'
import { useOrganization } from '@/hooks/useAuth'
import { DateInput } from '@/components/ui/date-input'
import { notify } from '@/utils/notifications'

interface AssessmentCreationModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AssessmentCreationModal({ isOpen, onClose }: AssessmentCreationModalProps) {
  const t = useTranslations('Assessment')
  const tCommon = useTranslations('Common')
  const router = useRouter()
  const { organizationId } = useOrganization()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('srednja')
  const [dueDate, setDueDate] = useState('')
  
  const { mutate: createAssessment, isPending } = useCreateAssessment()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!organizationId) {
      console.error('[AssessmentCreationModal] No organization ID found in user context')
      return
    }
    
    createAssessment(
      {
        title,
        description,
        organization_id: organizationId,
        security_level: securityLevel,
        due_date: dueDate ? `${dueDate}T23:59:59` : undefined
      },
      {
        onSuccess: (response) => {
          console.log('[AssessmentCreationModal] Assessment created successfully:', response)
          notify.success(t('createSuccess'))
          onClose()
          router.push(`/hr/assessments/${response.assessment_id}/questionnaire`)
        },
        onError: (error) => {
          console.error('[AssessmentCreationModal] Failed to create assessment:', error)
          notify.error(t('createError'))
        }
      }
    )
  }

  if (!isOpen) return null

  const getControlCount = (level: SecurityLevel) => {
    switch (level) {
      case 'osnovna':
        return 227
      case 'srednja':
      case 'napredna':
        return 277
      default:
        return 0
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">{t('actions.createNew')}</h3>
          <button 
            onClick={onClose} 
            className="btn btn-sm btn-circle btn-ghost"
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('fields.title')}</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input input-bordered w-full"
              placeholder={t('fields.titlePlaceholder')}
              required
              disabled={isPending}
            />
          </div>

          {/* Description */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('fields.description')}</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea textarea-bordered w-full"
              placeholder={t('fields.descriptionPlaceholder')}
              rows={3}
              disabled={isPending}
            />
          </div>

          {/* Due Date */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('fields.dueDate')}</span>
            </label>
            <DateInput
              value={dueDate}
              onChange={setDueDate}
              className="input input-bordered"
              min={new Date().toISOString().split('T')[0]}
              disabled={isPending}
            />
            <label className="label">
              <span className="label-text-alt text-base-content/60">
                {t('fields.dueDateHint')}
              </span>
            </label>
          </div>

          {/* Security Level Selection */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('securityLevel.label')}</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['osnovna', 'srednja', 'napredna'] as SecurityLevel[]).map((level) => (
                <div
                  key={level}
                  className={`card cursor-pointer transition-all ${
                    securityLevel === level 
                      ? 'ring-2 ring-primary bg-primary/10' 
                      : 'bg-base-200 hover:bg-base-300'
                  }`}
                  onClick={() => setSecurityLevel(level)}
                >
                  <div className="card-body p-4">
                    <h4 className={`font-semibold ${
                      level === 'osnovna' ? 'text-success' :
                      level === 'srednja' ? 'text-warning' :
                      'text-error'
                    }`}>
                      {t(`securityLevel.${level}`)}
                    </h4>
                    <p className="text-sm text-base-content/70 mt-1">
                      {getControlCount(level)} {t('progress.controls')}
                    </p>
                    {level === 'osnovna' && (
                      <p className="text-xs text-base-content/50 mt-2">
                        {t('securityLevel.osnovnaDesc')}
                      </p>
                    )}
                    {level === 'srednja' && (
                      <p className="text-xs text-base-content/50 mt-2">
                        {t('securityLevel.srednjaDesc')}
                      </p>
                    )}
                    {level === 'napredna' && (
                      <p className="text-xs text-base-content/50 mt-2">
                        {t('securityLevel.naprednaDesc')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="modal-action">
            <button 
              type="button" 
              onClick={onClose} 
              className="btn"
              disabled={isPending}
            >
              {tCommon('cancel')}
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={!title || isPending}
            >
              {isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  {tCommon('creating')}
                </>
              ) : (
                t('actions.create')
              )}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}