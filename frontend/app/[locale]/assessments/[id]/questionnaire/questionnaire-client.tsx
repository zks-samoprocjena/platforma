'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAssessment, useAssessmentQuestionnaire } from '@/hooks/api/use-assessments'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { QuestionnaireProgress } from '@/components/assessment/questionnaire-progress'
import { MeasureNavigation } from '@/components/assessment/measure-navigation' 
import { ControlCard } from '@/components/assessment/control-card'
import { SubmeasureSection } from '@/components/assessment/submeasure-section'
import { QuestionnaireHeader } from '@/components/assessment/questionnaire-header'
import { BulkActionsPanel } from '@/components/assessment/bulk-actions-panel'
import { SmartNavigation } from '@/components/assessment/smart-navigation'
import { AIRecommendationsPanel } from '@/components/ai/ai-recommendations-panel'
import { AIQAChat } from '@/components/ai/ai-qa-chat'
import { ErrorBoundary, APIErrorBoundary } from '@/components/error-boundary'

interface QuestionnaireClientProps {
  assessmentId: string
}

export default function QuestionnaireClient({ assessmentId }: QuestionnaireClientProps) {
  const t = useTranslations('Assessment')
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null)
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null)
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [viewMode, setViewMode] = useState<'submeasures' | 'controls'>('submeasures')

  const { data: assessmentDetail, isLoading: assessmentLoading } = useAssessment(assessmentId)
  const { data: questionnaire, isLoading: questionnaireLoading } = useAssessmentQuestionnaire(assessmentId)

  const isLoading = assessmentLoading || questionnaireLoading

  // Select first measure by default
  React.useEffect(() => {
    if (questionnaire?.measures && questionnaire.measures.length > 0 && !selectedMeasureId) {
      const firstMeasure = questionnaire.measures[0]
      setSelectedMeasureId(firstMeasure.id)
      // Select first control from first submeasure if in control view
      if (viewMode === 'controls' && firstMeasure.submeasures?.[0]?.controls?.[0]) {
        setSelectedControlId(firstMeasure.submeasures[0].controls[0].id)
      }
    }
  }, [questionnaire, selectedMeasureId, viewMode])

  const selectedMeasure = questionnaire?.measures?.find(m => m.id === selectedMeasureId)
  
  // Find selected control by searching through submeasures
  const findSelectedControl = () => {
    if (!selectedMeasure || !selectedControlId) return null
    for (const submeasure of selectedMeasure.submeasures) {
      const control = submeasure.controls.find(c => c.id === selectedControlId)
      if (control) return { control, submeasureId: submeasure.id }
    }
    return null
  }
  
  const selectedControlData = findSelectedControl()
  const selectedControl = selectedControlData?.control

  const handleMeasureSelect = (measureId: string) => {
    setSelectedMeasureId(measureId)
    const measure = questionnaire?.measures?.find(m => m.id === measureId)
    if (viewMode === 'controls' && measure?.submeasures?.[0]?.controls?.[0]) {
      setSelectedControlId(measure.submeasures[0].controls[0].id)
    }
  }

  const handleControlSelect = (controlId: string) => {
    setSelectedControlId(controlId)
  }

  const handleNextControl = () => {
    if (!selectedMeasure || !selectedControl) return

    // Find current control position within submeasures
    let found = false
    let nextControl = null
    
    for (let i = 0; i < selectedMeasure.submeasures.length; i++) {
      const submeasure = selectedMeasure.submeasures[i]
      const controlIndex = submeasure.controls.findIndex(c => c.id === selectedControlId)
      
      if (controlIndex !== -1) {
        found = true
        // Check if there's a next control in same submeasure
        if (controlIndex < submeasure.controls.length - 1) {
          nextControl = submeasure.controls[controlIndex + 1]
          break
        }
        // Check next submeasure
        if (i < selectedMeasure.submeasures.length - 1) {
          const nextSubmeasure = selectedMeasure.submeasures[i + 1]
          if (nextSubmeasure.controls.length > 0) {
            nextControl = nextSubmeasure.controls[0]
            break
          }
        }
      }
    }
    
    if (nextControl) {
      setSelectedControlId(nextControl.id)
    } else {
      // Move to next measure's first control
      const currentMeasureIndex = questionnaire?.measures?.findIndex(m => m.id === selectedMeasureId) || 0
      if (questionnaire?.measures && currentMeasureIndex < questionnaire.measures.length - 1) {
        const nextMeasure = questionnaire.measures[currentMeasureIndex + 1]
        setSelectedMeasureId(nextMeasure.id)
        if (nextMeasure.submeasures?.[0]?.controls?.[0]) {
          setSelectedControlId(nextMeasure.submeasures[0].controls[0].id)
        }
      }
    }
  }

  const handlePrevControl = () => {
    if (!selectedMeasure || !selectedControl) return

    // Find current control position within submeasures
    let found = false
    let prevControl = null
    
    for (let i = selectedMeasure.submeasures.length - 1; i >= 0; i--) {
      const submeasure = selectedMeasure.submeasures[i]
      const controlIndex = submeasure.controls.findIndex(c => c.id === selectedControlId)
      
      if (controlIndex !== -1) {
        found = true
        // Check if there's a previous control in same submeasure
        if (controlIndex > 0) {
          prevControl = submeasure.controls[controlIndex - 1]
          break
        }
        // Check previous submeasure
        if (i > 0) {
          const prevSubmeasure = selectedMeasure.submeasures[i - 1]
          if (prevSubmeasure.controls.length > 0) {
            prevControl = prevSubmeasure.controls[prevSubmeasure.controls.length - 1]
            break
          }
        }
      }
    }
    
    if (prevControl) {
      setSelectedControlId(prevControl.id)
    } else {
      // Move to previous measure's last control
      const currentMeasureIndex = questionnaire?.measures?.findIndex(m => m.id === selectedMeasureId) || 0
      if (currentMeasureIndex > 0 && questionnaire?.measures) {
        const prevMeasure = questionnaire.measures[currentMeasureIndex - 1]
        setSelectedMeasureId(prevMeasure.id)
        const lastSubmeasure = prevMeasure.submeasures[prevMeasure.submeasures.length - 1]
        if (lastSubmeasure?.controls.length > 0) {
          setSelectedControlId(lastSubmeasure.controls[lastSubmeasure.controls.length - 1].id)
        }
      }
    }
  }
  
  // Helper functions
  const getAllControlsFromMeasure = (measure: any) => {
    // For bulk actions, we need ALL control-submeasure pairs
    // Don't deduplicate because we need to update each relationship
    const controls: any[] = []
    measure.submeasures.forEach((submeasure: any) => {
      submeasure.controls.forEach((control: any) => {
        controls.push({
          ...control,
          submeasure_id: control.submeasure_id || submeasure.id
        })
      })
    })
    return controls
  }
  
  const getCurrentControlIndex = () => {
    if (!selectedMeasure || !selectedControlId) return 0
    let index = 0
    for (const submeasure of selectedMeasure.submeasures) {
      const controlIndex = submeasure.controls.findIndex(c => c.id === selectedControlId)
      if (controlIndex !== -1) {
        return index + controlIndex
      }
      index += submeasure.controls.length
    }
    return 0
  }
  
  const getTotalControlsCount = () => {
    if (!selectedMeasure) return 0
    return selectedMeasure.submeasures.reduce((total, submeasure) => total + submeasure.controls.length, 0)
  }
  
  const isLastControl = () => {
    if (!questionnaire?.measures || !selectedMeasure || !selectedControlId) return false
    const lastMeasure = questionnaire.measures[questionnaire.measures.length - 1]
    if (selectedMeasureId !== lastMeasure.id) return false
    const lastSubmeasure = lastMeasure.submeasures[lastMeasure.submeasures.length - 1]
    if (!lastSubmeasure || lastSubmeasure.controls.length === 0) return false
    return selectedControlId === lastSubmeasure.controls[lastSubmeasure.controls.length - 1].id
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    )
  }

  if (!assessmentDetail || !questionnaire) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-error">Greška učitavanja</h2>
          <p className="text-base-content/70">Nije moguće učitati upitnik.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-200 flex flex-col">
      {/* Header - fixed height */}
      <div className="flex-shrink-0">
        <QuestionnaireHeader assessmentDetail={assessmentDetail} />
      </div>
      
      {/* Main content area - fills remaining space */}
      <div className="flex-1 flex flex-col">
        {/* Progress bar - below header */}
        <div className="flex-shrink-0">
          <QuestionnaireProgress 
            assessment={assessmentDetail.assessment} 
            questionnaire={questionnaire} 
            selectedMeasureId={selectedMeasureId}
            onMeasureSelect={handleMeasureSelect}
          />
        </div>
        
        {/* Content area with sidebar */}
        <div className="flex-1 flex">
          {/* Sidebar - full height */}
          <div className="w-80 bg-base-100 border-r border-base-300 overflow-y-auto">
            <MeasureNavigation
              measures={questionnaire.measures}
              selectedMeasureId={selectedMeasureId}
              selectedControlId={selectedControlId}
              onMeasureSelect={handleMeasureSelect}
              onControlSelect={handleControlSelect}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex">
            {selectedMeasure ? (
              <>
                {/* Control/Submeasure View */}
                <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-base-50 to-base-100">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-base-content">
                    {selectedMeasure?.name_hr}
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className="btn-group">
                      <button
                        className={`btn btn-sm ${viewMode === 'submeasures' ? 'btn-active' : 'btn-outline'}`}
                        onClick={() => setViewMode('submeasures')}
                      >
                        Podmjere
                      </button>
                      <button
                        className={`btn btn-sm ${viewMode === 'controls' ? 'btn-active' : 'btn-outline'}`}
                        onClick={() => setViewMode('controls')}
                      >
                        Kontrole
                      </button>
                    </div>
                    <button
                      onClick={() => setShowBulkActions(true)}
                      className="btn btn-outline btn-sm gap-2"
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                      Grupno ocjenjivanje
                    </button>
                  </div>
                </div>
                
                {/* Navigation Controls - Only in control view */}
                {viewMode === 'controls' && (
                  <div className="bg-white border border-base-300 rounded-lg p-3 mb-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handlePrevControl}
                        className="btn btn-outline btn-sm"
                        disabled={
                          questionnaire?.measures &&
                          selectedMeasureId === questionnaire.measures[0]?.id &&
                          selectedControlId === questionnaire.measures[0]?.submeasures?.[0]?.controls?.[0]?.id
                        }
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                        {t('actions.previous')}
                      </button>

                      <div className="text-sm text-base-content/70 text-center">
                        {selectedMeasure && selectedControl && (
                          <>
                            Kontrola {getCurrentControlIndex() + 1} od {getTotalControlsCount()}
                          </>
                        )}
                      </div>

                      <button
                        onClick={handleNextControl}
                        className="btn btn-primary btn-sm"
                        disabled={
                          questionnaire?.measures &&
                          questionnaire.measures.length > 0 &&
                          selectedMeasureId === questionnaire.measures[questionnaire.measures.length - 1]?.id &&
                          isLastControl()
                        }
                      >
                        {t('actions.next')}
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Content based on view mode */}
                {viewMode === 'submeasures' ? (
                  // Submeasure View
                  <div className="space-y-4">
                    {selectedMeasure.submeasures.map(submeasure => (
                      <SubmeasureSection
                        key={submeasure.id}
                        submeasure={submeasure}
                        assessmentId={assessmentId}
                        organizationId={assessmentDetail.assessment.organization_id || ''}
                        measureName={selectedMeasure.name_hr}
                        securityLevel={assessmentDetail.assessment.security_level}
                      />
                    ))}
                  </div>
                ) : (
                  // Control View
                  <div className="bg-white rounded-xl border border-base-300 shadow-lg p-6">
                    {selectedControl && selectedControlData && (
                      <ErrorBoundary>
                        <ControlCard
                          control={selectedControl}
                          assessmentId={assessmentId}
                          organizationId={assessmentDetail.assessment.organization_id || ''}
                          measureName={selectedMeasure?.name_hr || ''}
                          submeasureId={selectedControlData.submeasureId}
                        />
                      </ErrorBoundary>
                    )}
                  </div>
                )}
              </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* Welcome Screen */}
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-base-content">Odaberite kontrolu</h3>
                    <p className="text-base-content/70">Kliknite na kontrolu u lijevom panelu za početak.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bulk Actions Panel */}
      {selectedMeasure && (
        <BulkActionsPanel
          controls={getAllControlsFromMeasure(selectedMeasure)}
          assessmentId={assessmentId}
          measureName={selectedMeasure.name_hr || ''}
          isOpen={showBulkActions}
          onClose={() => setShowBulkActions(false)}
        />
      )}
    </div>
  )
}