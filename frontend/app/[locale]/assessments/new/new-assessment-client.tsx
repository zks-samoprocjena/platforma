'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCreateAssessment } from '@/hooks/api/use-assessments'
import { SecurityLevel } from '@/types/assessment'
import { ArrowLeft, Shield, AlertTriangle, CheckCircle, Info, Zap } from 'lucide-react'
import Link from 'next/link'
import { useOrganization } from '@/hooks/useAuth'
import { DateInput } from '@/components/ui/date-input'

export function NewAssessmentClient() {
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
      console.error('[NewAssessment] No organization ID found in user context')
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
          console.log('[NewAssessment] Assessment created successfully:', response)
          router.push(`/hr/assessments/${response.assessment_id}/questionnaire`)
        },
        onError: (error) => {
          console.error('[NewAssessment] Failed to create assessment:', error)
          alert('Failed to create assessment. Please check the console for details.')
        }
      }
    )
  }

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

  const getMandatoryCount = (level: SecurityLevel) => {
    switch (level) {
      case 'osnovna':
        return 165
      case 'srednja':
        return 195
      case 'napredna':
        return 227
      default:
        return 0
    }
  }

  const getEstimatedTime = (level: SecurityLevel) => {
    switch (level) {
      case 'osnovna':
        return '3-5'
      case 'srednja':
        return '5-8'
      case 'napredna':
        return '8-12'
      default:
        return '0'
    }
  }

  const getLevelIcon = (level: SecurityLevel) => {
    switch (level) {
      case 'osnovna':
        return <Shield className="h-6 w-6 text-success" />
      case 'srednja':
        return <AlertTriangle className="h-6 w-6 text-warning" />
      case 'napredna':
        return <CheckCircle className="h-6 w-6 text-error" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/hr/assessments" 
            className="btn btn-ghost btn-sm mb-4 hover:bg-base-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Povratak na samoprocjene
          </Link>
          
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary mb-4 croatian-text">
              {t('actions.createNew')}
            </h1>
            <p className="text-lg text-base-content/70 max-w-2xl mx-auto croatian-text">
              Stvorite novu samoprocjenu kibernetičke sigurnosti prema propisima ZKS/NIS2
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Assessment Details Card */}
            <div className="assessment-card">
              <div className="flex items-center mb-6">
                <Info className="h-6 w-6 text-primary mr-3" />
                <h2 className="text-2xl font-semibold text-base-content croatian-text">
                  Osnovni podaci
                </h2>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Title */}
                <div className="md:col-span-2">
                  <label className="label">
                    <span className="label-text font-medium">{t('fields.title')}</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="form-input"
                    placeholder={t('fields.titlePlaceholder')}
                    required
                    disabled={isPending}
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="label">
                    <span className="label-text font-medium">{t('fields.description')}</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="form-textarea"
                    placeholder={t('fields.descriptionPlaceholder')}
                    rows={4}
                    disabled={isPending}
                  />
                </div>

                {/* Due Date */}
                <div className="md:col-span-2">
                  <label className="label">
                    <span className="label-text font-medium">{t('fields.dueDate')}</span>
                  </label>
                  <DateInput
                    value={dueDate}
                    onChange={setDueDate}
                    className="form-input"
                    min={new Date().toISOString().split('T')[0]}
                    disabled={isPending}
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      {t('fields.dueDateHint')}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Security Level Selection Card */}
            <div className="assessment-card">
              <div className="flex items-center mb-6">
                <Zap className="h-6 w-6 text-primary mr-3" />
                <h2 className="text-2xl font-semibold text-base-content croatian-text">
                  {t('securityLevel.label')}
                </h2>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                {(['osnovna', 'srednja', 'napredna'] as SecurityLevel[]).map((level) => (
                  <div
                    key={level}
                    className={`assessment-card cursor-pointer transition-all duration-300 interactive-scale ${
                      securityLevel === level 
                        ? 'ring-2 ring-primary bg-gradient-to-br from-primary/10 to-accent/5 border-primary/30' 
                        : 'hover:border-primary/20 hover:shadow-lg'
                    }`}
                    onClick={() => setSecurityLevel(level)}
                  >
                    <div className="p-6">
                      <div className="flex items-center mb-4">
                        {getLevelIcon(level)}
                        <h3 className="text-xl font-semibold ml-3 croatian-text">
                          {t(`securityLevel.${level}`)}
                        </h3>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-base-content/70">Ukupno kontrola:</span>
                          <span className="font-medium">{getControlCount(level)}</span>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-base-content/70">Obavezno:</span>
                          <span className="font-medium text-warning">{getMandatoryCount(level)}</span>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-base-content/70">Procijenjeno vrijeme:</span>
                          <span className="font-medium">{getEstimatedTime(level)} sati</span>
                        </div>

                        <div className="pt-3 border-t border-base-300">
                          <p className="text-sm text-base-content/70 croatian-text">
                            {t(`securityLevel.${level}Desc`)}
                          </p>
                        </div>
                      </div>

                      {securityLevel === level && (
                        <div className="mt-4 flex items-center text-primary">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium">Odabrano</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Level Recommendation */}
              <div className="mt-6 p-4 bg-info/10 border-l-4 border-l-info rounded-r-lg">
                <div className="flex items-start">
                  <Info className="h-5 w-5 text-info mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-info-content mb-1">Preporuka</h4>
                    <p className="text-sm text-base-content/70 croatian-text">
                      {securityLevel === 'osnovna' && 
                        'Osnovna razina je prikladna za manje organizacije s osnovnim sigurnosnim potrebama i ograničenim resursima.'
                      }
                      {securityLevel === 'srednja' && 
                        'Srednja razina preporučuje se za većinu organizacija koje žele uravnoteženu procjenu sigurnosti.'
                      }
                      {securityLevel === 'napredna' && 
                        'Napredna razina namijenjena je kritičnim organizacijama s visokim sigurnosnim zahtjevima.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <Link 
                href="/hr/assessments"
                className="btn btn-ghost order-2 sm:order-1"
              >
                {tCommon('cancel')}
              </Link>
              
              <button 
                type="submit" 
                className="btn-primary-enhanced btn-lg order-1 sm:order-2"
                disabled={!title.trim() || isPending}
              >
                {isPending ? (
                  <>
                    <span className="loading loading-spinner loading-sm mr-2"></span>
                    {tCommon('creating')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Započni samoprocjenu
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
    </div>
  )
}