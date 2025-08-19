'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { 
  DocumentTextIcon,
  CogIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  InformationCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/24/solid'
import { useUpdateAssessmentAnswers } from '@/hooks/api/use-assessments'
import { AIHelpPanel } from '@/components/ai/ai-help-panel'
import { AIControlChat } from '@/components/ai/ai-control-chat'
import { ControlDefinitionTooltip } from '@/components/assessment/control-definition-tooltip'
import type { AssessmentControl } from '@/types/assessment'

interface ControlCardProps {
  control: AssessmentControl
  assessmentId: string
  organizationId: string
  measureName: string
  submeasureId: string  // Required for M:N context
}

interface ControlAnswer {
  documentation_score: number | null
  implementation_score: number | null
  comments: string
}

export function ControlCard({ control, assessmentId, organizationId, measureName, submeasureId }: ControlCardProps) {
  const t = useTranslations('Assessment')
  const [answer, setAnswer] = useState<ControlAnswer>({
    documentation_score: control.documentation_score,
    implementation_score: control.implementation_score,
    comments: control.comments || ''
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showAIHelp, setShowAIHelp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  
  // Initialize state when control changes, but preserve unsaved changes
  useEffect(() => {
    // Only reset if we don't have unsaved changes
    if (!hasChanges) {
      setAnswer({
        documentation_score: control.documentation_score,
        implementation_score: control.implementation_score,
        comments: control.comments || ''
      })
      setLastSaved(null)
    }
  }, [control.id])
  
  // Update from server data when it changes (after save)
  useEffect(() => {
    // Only update if we don't have local changes and the server data is different
    if (!hasChanges) {
      const serverData = {
        documentation_score: control.documentation_score,
        implementation_score: control.implementation_score,
        comments: control.comments || ''
      }
      
      // Check if server data is different from current state
      if (
        serverData.documentation_score !== answer.documentation_score ||
        serverData.implementation_score !== answer.implementation_score ||
        serverData.comments !== answer.comments
      ) {
        setAnswer(serverData)
      }
    }
  }, [control.documentation_score, control.implementation_score, control.comments])

  const updateAnswers = useUpdateAssessmentAnswers()

  // Auto-save effect
  useEffect(() => {
    if (!hasChanges) return

    const saveTimer = setTimeout(() => {
      handleSave()
    }, 2000) // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(saveTimer)
  }, [answer, hasChanges])

  const handleScoreChange = (type: 'documentation' | 'implementation', score: number) => {
    setAnswer(prev => ({
      ...prev,
      [`${type}_score`]: score
    }))
    setHasChanges(true)
  }

  const handleCommentsChange = (comments: string) => {
    setAnswer(prev => ({ ...prev, comments }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!hasChanges || isSaving) return
    
    setIsSaving(true)
    try {
      await updateAnswers.mutateAsync({
        assessmentId,
        answers: [{
          control_id: control.id,
          submeasure_id: submeasureId,  // Use the passed submeasure context
          ...(answer.documentation_score !== null && { documentation_score: answer.documentation_score }),
          ...(answer.implementation_score !== null && { implementation_score: answer.implementation_score }),
          ...(answer.comments && { comments: answer.comments })
        }]
      })
      setHasChanges(false)
      setLastSaved(new Date())
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const renderStarRating = (
    type: 'documentation' | 'implementation',
    currentScore: number | null,
    onChange: (score: number) => void
  ) => {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onChange(star)}
              className={`p-1 transition-all transform hover:scale-110 ${
                currentScore && star <= currentScore
                  ? 'text-warning'
                  : 'text-base-300 hover:text-warning/50'
              }`}
              title={`Ocjena ${star}`}
            >
              <StarIcon className="h-8 w-8" />
            </button>
          ))}
        </div>
        <div className="text-sm font-medium text-base-content mt-2">
          {currentScore ? (
            <span className="text-primary">{currentScore}/5 - {
              currentScore === 5 ? 'Izvrsno' :
              currentScore === 4 ? 'Vrlo dobro' :
              currentScore === 3 ? 'Dobro' :
              currentScore === 2 ? 'Zadovoljava' :
              'Nedovoljno'
            }</span>
          ) : (
            <span className="text-base-content/50">Nije ocijenjeno</span>
          )}
        </div>
      </div>
    )
  }

  const getComplianceLevel = (docScore: number | null, implScore: number | null) => {
    if (!docScore || !implScore) return null
    const avg = (docScore + implScore) / 2
    if (avg >= 4) return { level: 'Izvrsno', color: 'text-success' }
    if (avg >= 3) return { level: 'Dobro', color: 'text-info' }
    if (avg >= 2) return { level: 'Umjereno', color: 'text-warning' }
    return { level: 'Potrebno poboljšanje', color: 'text-error' }
  }

  const compliance = getComplianceLevel(answer.documentation_score, answer.implementation_score)
  
  // Check if control meets minimum score requirement
  const minimumScore = control.submeasure_context?.minimum_score ?? control.minimum_score
  const meetsMinimum = minimumScore === null || 
    minimumScore === undefined ||
    !answer.documentation_score || 
    !answer.implementation_score ||
    Math.min(answer.documentation_score, answer.implementation_score) >= minimumScore

  return (
    <div className={`bg-base-100 rounded-lg shadow-sm border-2 transition-colors ${!meetsMinimum ? 'border-error/50 bg-error/5' : 'border-base-300'}`}>
      {/* Header */}
      <div className="p-6 border-b border-base-300">
        {/* Main Content */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg tooltip tooltip-right ${
              (control.submeasure_context?.is_mandatory ?? control.is_mandatory) ? 'bg-error/10' : 'bg-info/10'
            }`} data-tip={(control.submeasure_context?.is_mandatory ?? control.is_mandatory) ? 'Obavezna kontrola' : 'Dobrovoljna kontrola'}>
              {(control.submeasure_context?.is_mandatory ?? control.is_mandatory) ? (
                <ExclamationCircleIcon className={`h-6 w-6 ${
                  (control.submeasure_context?.is_mandatory ?? control.is_mandatory) ? 'text-error' : 'text-info'
                }`} />
              ) : (
                <CheckCircleIcon className="h-6 w-6 text-info" />
              )}
            </div>
            
            <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-base-content/70">
                {measureName} • Kontrola {control.code}
              </span>
            </div>
            
            <h2 className="text-xl font-semibold text-base-content mb-2 flex items-center gap-2">
              {control.name_hr}
              <ControlDefinitionTooltip 
                control={control}
                catalogLink={`/catalog/annex-c#${control.code}`}
              />
            </h2>
            
            {control.description_hr && (
              <p className="text-base-content/70 leading-relaxed">
                {control.description_hr}
              </p>
            )}
            
            {/* Compliance Status and Save Indicator */}
            <div className="flex items-center gap-4 mt-3">
              {compliance && (
                <span className={`text-sm font-medium ${compliance.color}`}>
                  {compliance.level}
                </span>
              )}
              
              {/* Minimum Score Requirement */}
              {(control.submeasure_context?.minimum_score ?? control.minimum_score) !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-base-content/70">
                    Min. ocjena:
                  </span>
                  {(control.submeasure_context?.minimum_score ?? control.minimum_score) === null ? (
                    <span className="text-sm font-medium text-base-content/50">-</span>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-base-content">
                        {control.submeasure_context?.minimum_score ?? control.minimum_score}
                      </span>
                      {answer.documentation_score && answer.implementation_score && (
                        <span className={`text-sm ${
                          Math.min(answer.documentation_score, answer.implementation_score) >= (control.submeasure_context?.minimum_score ?? control.minimum_score!)
                            ? 'text-success'
                            : 'text-error'
                        }`}>
                          {Math.min(answer.documentation_score, answer.implementation_score) >= control.minimum_score
                            ? '✓'
                            : '✗'}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
              
              <div className="text-xs text-base-content/60">
                {isSaving ? (
                  <span className="text-warning flex items-center gap-1">
                    <span className="loading loading-spinner loading-xs"></span>
                    Čuva se...
                  </span>
                ) : hasChanges ? (
                  <span className="text-info flex items-center gap-1">
                    <span className="loading loading-dots loading-xs"></span>
                    Auto-spremanje...
                  </span>
                ) : lastSaved ? (
                  <span className="text-success flex items-center gap-1">
                    <CheckCircleIcon className="h-3 w-3" />
                    Spremljeno {lastSaved.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          </div>
          
          {/* Ask AI Button */}
          <button
            onClick={() => setShowAIChat(true)}
            className="btn btn-outline btn-secondary btn-sm gap-2"
          >
            <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
            {t('controls.askAI')}
          </button>
        </div>
      </div>

      {/* Scoring Section */}
      <div className="p-6">
        <div className="grid lg:grid-cols-2 gap-8 mb-6">
          {/* Documentation Score */}
          <div className="bg-base-50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-base-content">
                  {t('controls.documentation')}
                </h3>
              </div>
              {control.rating_guidance && control.rating_guidance.length > 0 && (
                <button
                  onClick={() => setShowRatingModal(true)}
                  className="btn btn-ghost btn-xs btn-circle"
                  title="Pogledaj kriterije ocjenjivanja"
                >
                  <InformationCircleIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            
            <p className="text-sm text-base-content/70 mb-4">
              Ocijenite razinu dokumentiranosti ove sigurnosne kontrole
            </p>
            
            <div className="mb-4">
              {renderStarRating(
                'documentation',
                answer.documentation_score,
                (score) => handleScoreChange('documentation', score)
              )}
            </div>
            
            <div className="p-3 bg-base-100 rounded-lg text-xs text-base-content/60 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">1:</span> Nema dokumentacije
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">3:</span> Djelomično dokumentirano
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">5:</span> Potpuno dokumentirano
              </div>
            </div>
          </div>

          {/* Implementation Score */}
          <div className="bg-base-50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CogIcon className="h-5 w-5 text-secondary" />
                <h3 className="font-semibold text-base-content">
                  {t('controls.implementation')}
                </h3>
              </div>
              {control.rating_guidance && control.rating_guidance.length > 0 && (
                <button
                  onClick={() => setShowRatingModal(true)}
                  className="btn btn-ghost btn-xs btn-circle"
                  title="Pogledaj kriterije ocjenjivanja"
                >
                  <InformationCircleIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            
            <p className="text-sm text-base-content/70 mb-4">
              Ocijenite razinu implementiranosti ove sigurnosne kontrole
            </p>
            
            <div className="mb-4">
              {renderStarRating(
                'implementation',
                answer.implementation_score,
                (score) => handleScoreChange('implementation', score)
              )}
            </div>
            
            <div className="p-3 bg-base-100 rounded-lg text-xs text-base-content/60 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">1:</span> Nije implementirano
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">3:</span> Djelomično implementirano
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">5:</span> Potpuno implementirano
              </div>
            </div>
          </div>
        </div>

        {/* Comments Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-base-content mb-2">
            {t('controls.comments')}
          </label>
          <textarea
            value={answer.comments}
            onChange={(e) => handleCommentsChange(e.target.value)}
            placeholder="Dodajte komentare, objašnjenja ili bilješke o ovoj kontroli..."
            className="textarea textarea-bordered w-full h-24 text-sm"
          />
          <div className="text-xs text-base-content/60 mt-1">
            {answer.comments.length}/500 znakova
          </div>
        </div>

        {/* AI Help Panel */}
        <div className="mb-6">
          <AIHelpPanel
            control={control}
            organizationId={organizationId}
            assessmentId={assessmentId}
            isExpanded={showAIHelp}
            onToggle={() => setShowAIHelp(!showAIHelp)}
          />
        </div>

        {/* Evidence Upload */}
        <div>
          <label className="block text-sm font-medium text-base-content mb-2">
            {t('controls.evidence')}
          </label>
          <div className="border-2 border-dashed border-base-300 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
            <CloudArrowUpIcon className="h-8 w-8 text-base-content/40 mx-auto mb-2" />
            <p className="text-sm text-base-content/70 mb-1">
              Povucite datoteke ovdje ili kliknite za odabir
            </p>
            <p className="text-xs text-base-content/50">
              PDF, Word dokumenti, slike (max 10MB)
            </p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="bg-base-50 px-6 py-4 rounded-b-lg">
        <div className="flex items-center justify-between">
          <div className="text-sm text-base-content/70">
            {answer.documentation_score && answer.implementation_score ? (
              <>
                Prosjek: {((answer.documentation_score + answer.implementation_score) / 2).toFixed(1)}/5
                {compliance && (
                  <span className={`ml-2 font-medium ${compliance.color}`}>
                    • {compliance.level}
                  </span>
                )}
              </>
            ) : (
              'Postavite obje ocjene za izračun rezultata'
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {updateAnswers.isPending && (
              <span className="loading loading-spinner loading-sm"></span>
            )}
            
            {/* Warning for incomplete mandatory controls */}
            {(control.submeasure_context?.is_mandatory ?? control.is_mandatory) && (!answer.documentation_score || !answer.implementation_score) && (
              <div className="alert alert-warning alert-sm py-2">
                <ExclamationCircleIcon className="h-4 w-4" />
                <span className="text-xs">Obavezna kontrola mora biti kompletno ocjenjena</span>
              </div>
            )}
            
            {/* Warning for not meeting minimum score */}
            {(control.submeasure_context?.minimum_score ?? control.minimum_score) !== null && 
             (control.submeasure_context?.minimum_score ?? control.minimum_score) !== undefined &&
             answer.documentation_score && 
             answer.implementation_score &&
             Math.min(answer.documentation_score, answer.implementation_score) < (control.submeasure_context?.minimum_score ?? control.minimum_score!) && (
              <div className="alert alert-error alert-sm py-2">
                <ExclamationCircleIcon className="h-4 w-4" />
                <span className="text-xs">
                  Kontrola ne zadovoljava minimalnu ocjenu {control.submeasure_context?.minimum_score ?? control.minimum_score}
                </span>
              </div>
            )}
            
            <button 
              className="btn btn-primary btn-sm"
              disabled={!answer.documentation_score || !answer.implementation_score}
            >
              Označeno kao završeno
            </button>
          </div>
        </div>
      </div>
      
      {/* Rating Guidance Modal */}
      {showRatingModal && control.rating_guidance && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-4">Kriteriji za ocjenjivanje kontrole</h3>
            
            <div className="space-y-4">
              {control.rating_guidance
                .sort((a, b) => a.score - b.score)
                .map((guidance) => (
                  <div key={guidance.score} className="border border-base-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <StarIcon 
                            key={i} 
                            className={`h-5 w-5 ${i < guidance.score ? 'text-warning' : 'text-base-300'}`} 
                          />
                        ))}
                      </div>
                      <span className="font-semibold">Ocjena {guidance.score}</span>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <h4 className="font-medium text-primary mb-1">Dokumentacija:</h4>
                        <p className="text-base-content/80">{guidance.documentation_criteria}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-secondary mb-1">Implementacija:</h4>
                        <p className="text-base-content/80">{guidance.implementation_criteria}</p>
                      </div>
                    </div>
                  </div>
              ))}
            </div>
            
            <div className="modal-action">
              <button className="btn" onClick={() => setShowRatingModal(false)}>
                Zatvori
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowRatingModal(false)}></div>
        </div>
      )}
      
      {/* AI Control Chat Modal */}
      {showAIChat && (
        <AIControlChat
          control={control}
          assessmentId={assessmentId}
          organizationId={organizationId}
          onClose={() => setShowAIChat(false)}
        />
      )}
    </div>
  )
}