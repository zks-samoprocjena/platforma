'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeftIcon, CheckCircleIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { useSubmitAssessment, useUpdateAssessment, useTransitionAssessmentStatus } from '@/hooks/api/use-assessments'
import { toast } from 'react-hot-toast'
import type { AssessmentDetailResponse } from '@/types/assessment'

interface QuestionnaireHeaderProps {
  assessmentDetail: AssessmentDetailResponse
}

export function QuestionnaireHeader({ assessmentDetail }: QuestionnaireHeaderProps) {
  const t = useTranslations('Assessment')
  const router = useRouter()
  const submitAssessment = useSubmitAssessment()
  const updateAssessment = useUpdateAssessment()
  const transitionStatus = useTransitionAssessmentStatus()
  
  // Extract assessment data from nested structure
  const { assessment, scores } = assessmentDetail

  const getSecurityLevelBadge = (level: string) => {
    const badges = {
      osnovna: 'badge-success',
      srednja: 'badge-warning', 
      napredna: 'badge-error'
    }
    return badges[level as keyof typeof badges] || 'badge-ghost'
  }

  const getSecurityLevelText = (level: string) => {
    const levels = {
      osnovna: 'Osnovna',
      srednja: 'Srednja',
      napredna: 'Napredna'
    }
    return levels[level as keyof typeof levels] || level
  }

  const handleSubmitForReview = async () => {
    try {
      await submitAssessment.mutateAsync(assessment.id)
      toast.success('Procjena je poslana na pregled')
      router.refresh()
    } catch (error: any) {
      // Extract validation error messages from 422 response
      if (error?.status === 422 && error?.details) {
        // Show validation errors
        if (error.details.validation_errors && Array.isArray(error.details.validation_errors)) {
          error.details.validation_errors.forEach((err: any) => {
            // Handle both string and object error formats
            if (typeof err === 'string') {
              toast.error(err)
            } else if (err.message) {
              toast.error(err.message)
            }
          })
        }
        
        // Show validation warnings (as info messages)
        if (error.details.validation_warnings && Array.isArray(error.details.validation_warnings)) {
          error.details.validation_warnings.forEach((warn: any) => {
            if (typeof warn === 'string') {
              toast(warn, { icon: '⚠️' })
            } else if (warn.message) {
              toast(warn.message, { icon: '⚠️' })
            }
          })
        }
        
        // If no specific errors shown, show generic message
        if (!error.details.validation_errors || error.details.validation_errors.length === 0) {
          toast.error('Validacija nije prošla - provjerite jesu li sve obavezne kontrole popunjene')
        }
      } else {
        toast.error('Greška prilikom slanja procjene na pregled')
      }
    }
  }

  const handleMarkAsCompleted = async () => {
    try {
      await transitionStatus.mutateAsync({
        id: assessment.id,
        status: 'completed',
        reason: 'Marked as completed after review'
      })
      toast.success('Procjena je označena kao završena')
      router.refresh()
    } catch (error) {
      toast.error('Greška prilikom označavanja procjene kao završene')
    }
  }

  return (
    <header className="bg-base-100 border-b border-base-300 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="btn btn-ghost btn-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Natrag
          </button>
          
          <div className="divider divider-horizontal"></div>
          
          <div>
            <h1 className="text-xl font-semibold text-base-content">
              {assessment.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`badge badge-sm ${getSecurityLevelBadge(assessment.security_level)}`}>
                {getSecurityLevelText(assessment.security_level)} razina
              </span>
              <span className="text-sm text-base-content/70">
                •
              </span>
              <span className="text-sm text-base-content/70">
                Stvoren {new Date(assessment.created_at).toLocaleDateString('hr-HR')}
              </span>
              {assessment.updated_at !== assessment.created_at && (
                <>
                  <span className="text-sm text-base-content/70">
                    •
                  </span>
                  <span className="text-sm text-base-content/70">
                    Zadnje ažuriran {new Date(assessment.updated_at).toLocaleDateString('hr-HR')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-sm font-medium text-base-content">
              Status: <span className="capitalize">{assessment.status}</span>
            </div>
            {scores.compliance_percentage && (
              <div className="text-sm text-base-content/70">
                Usklađenost: {scores.compliance_percentage}%
              </div>
            )}
          </div>
          
          {/* Status action buttons */}
          {assessment.status === 'in_progress' && (
            <div className="flex items-center gap-2">
              {/* Show hint if mandatory controls are not completed */}
              {assessmentDetail.progress && 
               assessmentDetail.progress.mandatory_controls > 0 &&
               (assessmentDetail.progress.mandatory_answered || assessmentDetail.progress.completed_mandatory || 0) < assessmentDetail.progress.mandatory_controls && (
                <div className="text-xs text-warning">
                  Obavezne kontrole: {assessmentDetail.progress.mandatory_answered || assessmentDetail.progress.completed_mandatory || 0}/{assessmentDetail.progress.mandatory_controls}
                </div>
              )}
              <button
                onClick={handleSubmitForReview}
                disabled={submitAssessment.isPending}
                className="btn btn-primary btn-sm"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                Pošalji na pregled
              </button>
            </div>
          )}
          
          {assessment.status === 'review' && (
            <button
              onClick={handleMarkAsCompleted}
              disabled={transitionStatus.isPending}
              className="btn btn-success btn-sm"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Označi kao završeno
            </button>
          )}
          
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zM12 13a1 1 0 110-2 1 1 0 010 2zM12 20a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </div>
            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
              <li><a>Izvezi u PDF</a></li>
              <li><a>Izvezi u Excel</a></li>
              <li><hr /></li>
              <li><a>Postavke</a></li>
            </ul>
          </div>
        </div>
      </div>
    </header>
  )
}