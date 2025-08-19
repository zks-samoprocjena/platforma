'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { 
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useUpdateAssessmentAnswers } from '@/hooks/api/use-assessments'
import type { AssessmentControl } from '@/types/assessment'

interface BulkActionsPanelProps {
  controls: AssessmentControl[]
  assessmentId: string
  measureName: string
  isOpen: boolean
  onClose: () => void
}

interface BulkAnswer {
  documentation_score: number | null
  implementation_score: number | null
  comments: string
}

export function BulkActionsPanel({ 
  controls, 
  assessmentId, 
  measureName, 
  isOpen, 
  onClose 
}: BulkActionsPanelProps) {
  const t = useTranslations('Assessment')
  const [bulkAnswer, setBulkAnswer] = useState<BulkAnswer>({
    documentation_score: null,
    implementation_score: null,
    comments: ''
  })
  const [selectedControls, setSelectedControls] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const updateAnswers = useUpdateAssessmentAnswers()
  
  // Get unique controls for display (but keep all for updates)
  const uniqueControls = Array.from(
    new Map(controls.map(c => [c.id, c])).values()
  )

  const handleSelectAll = () => {
    if (selectedControls.length === uniqueControls.length) {
      setSelectedControls([])
    } else {
      setSelectedControls(uniqueControls.map(c => c.id))
    }
  }

  const handleControlToggle = (controlId: string) => {
    setSelectedControls(prev => 
      prev.includes(controlId) 
        ? prev.filter(id => id !== controlId)
        : [...prev, controlId]
    )
  }

  const handleApplyBulkAnswers = async () => {
    if (selectedControls.length === 0 || !bulkAnswer.documentation_score || !bulkAnswer.implementation_score) {
      return
    }

    try {
      // For each selected control, find ALL its occurrences (all submeasures)
      const answers: any[] = []
      selectedControls.forEach(controlId => {
        // Find all occurrences of this control (it may appear in multiple submeasures)
        const controlOccurrences = controls.filter(c => c.id === controlId)
        
        controlOccurrences.forEach(control => {
          answers.push({
            control_id: controlId,
            submeasure_id: control.submeasure_id,
            documentation_score: bulkAnswer.documentation_score!,
            implementation_score: bulkAnswer.implementation_score!,
            comments: bulkAnswer.comments
          })
        })
      })

      await updateAnswers.mutateAsync({
        assessmentId,
        answers
      })

      // Reset form and close
      setBulkAnswer({ documentation_score: null, implementation_score: null, comments: '' })
      setSelectedControls([])
      setShowPreview(false)
      onClose()
    } catch (error) {
      console.error('Bulk update failed:', error)
    }
  }

  const renderStarRating = (
    type: 'documentation' | 'implementation',
    currentScore: number | null,
    onChange: (score: number) => void
  ) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onChange(star)}
            className={`p-1 transition-colors ${
              currentScore && star <= currentScore
                ? 'text-warning'
                : 'text-base-300 hover:text-warning/50'
            }`}
          >
            <CheckCircleIcon className="h-5 w-5" />
          </button>
        ))}
        <span className="ml-2 text-sm text-base-content/70">
          {currentScore ? `${currentScore}/5` : 'Nije ocijenjeno'}
        </span>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-base-100 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-base-300">
          <div>
            <h2 className="text-xl font-semibold text-base-content">
              Grupno ocjenjivanje kontrola
            </h2>
            <p className="text-sm text-base-content/70">
              {measureName} • {uniqueControls.length} kontrola dostupno
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {!showPreview ? (
            <>
              {/* Control Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-base-content">
                    Odaberite kontrole za grupno ocjenjivanje
                  </h3>
                  <button
                    onClick={handleSelectAll}
                    className="btn btn-outline btn-sm"
                  >
                    {selectedControls.length === uniqueControls.length ? 'Poništi sve' : 'Odaberi sve'}
                  </button>
                </div>

                <div className="grid gap-2 max-h-64 overflow-y-auto border border-base-300 rounded-lg p-4">
                  {uniqueControls.map((control) => (
                    <label
                      key={control.id}
                      className="flex items-center gap-3 p-2 hover:bg-base-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedControls.includes(control.id)}
                        onChange={() => handleControlToggle(control.id)}
                        className="checkbox checkbox-sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {control.code}
                          </span>
                          <span className={`badge badge-xs ${
                            control.is_mandatory ? 'badge-error' : 'badge-info'
                          }`}>
                            {control.is_mandatory ? 'Obavezno' : 'Dobrovoljno'}
                          </span>
                        </div>
                        <p className="text-sm text-base-content/70 truncate">
                          {control.name_hr}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                <p className="text-sm text-base-content/60 mt-2">
                  Odabrano: {selectedControls.length} od {uniqueControls.length} kontrola
                </p>
              </div>

              {/* Bulk Scoring */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-base-50 rounded-lg p-4">
                  <h4 className="font-semibold text-base-content mb-3">
                    Dokumentacija
                  </h4>
                  {renderStarRating(
                    'documentation',
                    bulkAnswer.documentation_score,
                    (score) => setBulkAnswer(prev => ({ ...prev, documentation_score: score }))
                  )}
                </div>

                <div className="bg-base-50 rounded-lg p-4">
                  <h4 className="font-semibold text-base-content mb-3">
                    Implementacija
                  </h4>
                  {renderStarRating(
                    'implementation',
                    bulkAnswer.implementation_score,
                    (score) => setBulkAnswer(prev => ({ ...prev, implementation_score: score }))
                  )}
                </div>
              </div>

              {/* Bulk Comments */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-base-content mb-2">
                  Komentar (primijeniti će se na sve odabrane kontrole)
                </label>
                <textarea
                  value={bulkAnswer.comments}
                  onChange={(e) => setBulkAnswer(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Opći komentar za odabrane kontrole..."
                  className="textarea textarea-bordered w-full h-20 text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-base-content/70">
                  {selectedControls.length > 0 && bulkAnswer.documentation_score && bulkAnswer.implementation_score ? (
                    <span className="text-success">
                      ✓ Spreman za primjenu na {selectedControls.length} kontrola
                    </span>
                  ) : (
                    <span>
                      Odaberite kontrole i postavite ocjene
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="btn btn-outline btn-sm"
                  >
                    Odustani
                  </button>
                  <button
                    onClick={() => setShowPreview(true)}
                    disabled={selectedControls.length === 0 || !bulkAnswer.documentation_score || !bulkAnswer.implementation_score}
                    className="btn btn-primary btn-sm"
                  >
                    Pretpregled
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Preview */}
              <div className="mb-6">
                <h3 className="font-semibold text-base-content mb-4">
                  Pretpregled grupnog ocjenjivanja
                </h3>

                <div className="bg-info/5 border border-info/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-info" />
                    <span className="font-medium text-info">Pregled promjena</span>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Dokumentacija:</span> {bulkAnswer.documentation_score}/5
                    </div>
                    <div>
                      <span className="font-medium">Implementacija:</span> {bulkAnswer.implementation_score}/5
                    </div>
                    <div>
                      <span className="font-medium">Kontrola:</span> {selectedControls.length}
                    </div>
                  </div>
                  {bulkAnswer.comments && (
                    <div className="mt-2">
                      <span className="font-medium">Komentar:</span> {bulkAnswer.comments}
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {uniqueControls
                    .filter(c => selectedControls.includes(c.id))
                    .map((control) => (
                      <div key={control.id} className="flex items-center gap-3 p-2 bg-base-50 rounded">
                        <span className="text-sm font-medium">{control.code}</span>
                        <span className="text-sm text-base-content/70 flex-1">
                          {control.name_hr}
                        </span>
                        <span className="text-xs text-success">
                          {bulkAnswer.documentation_score}/{bulkAnswer.implementation_score}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Preview Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowPreview(false)}
                  className="btn btn-outline btn-sm"
                >
                  Natrag
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="btn btn-outline btn-sm"
                  >
                    Odustani
                  </button>
                  <button
                    onClick={handleApplyBulkAnswers}
                    disabled={updateAnswers.isPending}
                    className="btn btn-primary btn-sm"
                  >
                    {updateAnswers.isPending ? (
                      <span className="loading loading-spinner loading-sm"></span>
                    ) : (
                      'Primijeni promjene'
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}