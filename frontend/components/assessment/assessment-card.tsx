'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Assessment } from '@/types/assessment'
import { FileText, Clock, CheckCircle, AlertCircle, MoreVertical, Trash2, AlertTriangle, FileDown, Archive, User } from 'lucide-react'
import { format } from 'date-fns'
import { hr } from 'date-fns/locale'
import Link from 'next/link'
import { useDeleteAssessment, useDuplicateAssessment } from '@/hooks/api/use-assessments'
import { useArchiveAssessment, useExportAssessmentPDF } from '@/hooks/api/use-assessment-actions'
import { notify } from '@/utils/notifications'
import { DualProgressRing } from '@/components/ui/dual-progress-ring'
import { DeadlineBadge } from '@/components/ui/deadline-badge'

interface AssessmentCardProps {
  assessment: Assessment
}

export function AssessmentCard({ assessment }: AssessmentCardProps) {
  const t = useTranslations('Assessment')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const { mutate: deleteAssessment, isPending: isDeleting } = useDeleteAssessment()
  const { mutate: duplicateAssessment } = useDuplicateAssessment()
  const { mutate: archiveAssessment, isPending: isArchiving } = useArchiveAssessment()
  const { mutate: exportPDF, isPending: isExporting } = useExportAssessmentPDF()
  
  // Debug logging
  console.log('[ASSESSMENT_CARD] Render data:', {
    id: assessment.id,
    status: assessment.status,
    title: assessment.title,
    progress: assessment.progress,
    completion_percentage: assessment.completion_percentage,
    total_controls: assessment.total_controls,
    answered_controls: assessment.answered_controls,
    hasProgressObject: !!assessment.progress,
    progressPercentage: assessment.progress?.completion_percentage
  })

  const getStatusIcon = () => {
    switch (assessment.status) {
      case 'draft':
        return <FileText className="h-5 w-5" />
      case 'in_progress':
        return <Clock className="h-5 w-5" />
      case 'review':
        return <AlertCircle className="h-5 w-5" />
      case 'completed':
        return <CheckCircle className="h-5 w-5" />
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (assessment.status) {
      case 'draft':
        return 'badge-ghost'
      case 'in_progress':
        return 'badge-warning'
      case 'review':
        return 'badge-info'
      case 'completed':
        return 'badge-success'
      default:
        return ''
    }
  }

  const getSecurityLevelColor = () => {
    switch (assessment.security_level) {
      case 'osnovna':
        return 'text-success'
      case 'srednja':
        return 'text-warning'
      case 'napredna':
        return 'text-error'
      default:
        return ''
    }
  }

  const progressPercentage = Math.round(assessment.progress?.completion_percentage || assessment.completion_percentage || 0)

  const handleDelete = () => {
    setShowDeleteModal(true)
  }

  const confirmDelete = () => {
    console.log('Attempting to delete assessment:', assessment.id)
    deleteAssessment(assessment.id, {
      onSuccess: (data) => {
        console.log('Delete successful:', data)
        setShowDeleteModal(false)
        notify.success(t('deleteSuccess'))
      },
      onError: (error) => {
        console.error('Delete failed:', error)
        notify.error(t('deleteError'))
        setShowDeleteModal(false)
      }
    })
  }

  const handleDuplicate = () => {
    duplicateAssessment(assessment.id, {
      onSuccess: () => {
        notify.success(t('duplicateSuccess'))
      },
      onError: (error) => {
        console.error('Duplicate failed:', error)
        notify.error(t('duplicateError'))
      }
    })
  }

  const handleArchive = () => {
    setShowArchiveModal(true)
  }

  const confirmArchive = () => {
    archiveAssessment(assessment.id)
    setShowArchiveModal(false)
  }

  const handleExportPDF = () => {
    exportPDF(assessment.id)
  }

  // Calculate progress percentages
  const mandatoryControls = assessment.progress?.mandatory_controls || assessment.mandatory_controls || 0
  const mandatoryAnswered = assessment.progress?.mandatory_answered || assessment.mandatory_answered || 0
  const mandatoryProgressPercentage = mandatoryControls > 0
    ? Math.round((mandatoryAnswered / mandatoryControls) * 100)
    : 0

  return (
    <>
      <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow h-full">
        <div className="card-body">
          {/* Header */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className={`badge ${getStatusColor()} gap-1`}>
                {getStatusIcon()}
                {t(`status.${assessment.status}`)}
              </div>
            </div>
            
            {/* Actions Dropdown */}
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-ghost btn-circle btn-sm">
                <MoreVertical className="h-4 w-4" />
              </label>
              <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                <li>
                  <Link href={`/hr/assessments/${assessment.id}/questionnaire`}>
                    <Clock className="h-4 w-4" />
                    {t('actions.resume')}
                  </Link>
                </li>
                <li>
                  <a onClick={handleDuplicate}>
                    <FileText className="h-4 w-4" />
                    {t('actions.duplicate')}
                  </a>
                </li>
                <li>
                  <a onClick={handleExportPDF} className={isExporting ? 'opacity-50 cursor-not-allowed' : ''}>
                    <FileDown className="h-4 w-4" />
                    {isExporting ? t('actions.exporting') : t('actions.exportPDF')}
                  </a>
                </li>
                <li>
                  <a onClick={handleArchive}>
                    <Archive className="h-4 w-4" />
                    {t('actions.archive')}
                  </a>
                </li>
                <li className="divider"></li>
                <li>
                  <a onClick={handleDelete} className="text-error">
                    <Trash2 className="h-4 w-4" />
                    {t('actions.delete')}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Title - Clickable */}
          <Link href={`/hr/assessments/${assessment.id}/questionnaire`} className="hover:underline">
            <h3 className="card-title text-lg line-clamp-2">{assessment.title}</h3>
          </Link>
          
          {assessment.description && (
            <p className="text-sm text-base-content/70 line-clamp-2 mt-1">{assessment.description}</p>
          )}

          {/* Main Content Area with Progress and Info */}
          <div className="flex items-center gap-4 mt-4">
            {/* Progress Rings - Show for all assessments with progress data or draft status */}
            {(assessment.progress || assessment.status === 'draft') && (
              <div className="flex-shrink-0">
                <DualProgressRing
                  outerProgress={progressPercentage}
                  innerProgress={mandatoryProgressPercentage}
                  totalControls={assessment.progress?.total_controls || assessment.total_controls || 0}
                  mandatoryControls={mandatoryControls}
                  size="sm"
                />
              </div>
            )}
            
            {/* Info Section */}
            <div className="flex-1 space-y-2">
              {/* Security Level and Deadline */}
              <div className="flex flex-wrap gap-2">
                <div className={`badge badge-sm ${getSecurityLevelColor()}`}>
                  {t(`securityLevel.${assessment.security_level}`)}
                </div>
                <DeadlineBadge 
                  dueDate={assessment.due_date} 
                  status={assessment.status}
                  size="sm"
                />
              </div>
              
              {/* Progress Text - Show for all assessments */}
              {(assessment.progress || assessment.status === 'draft') && (
                <div className="text-sm space-y-1">
                  <div className="text-base-content/70">
                    <span className="font-medium">{t('progress.overall')}:</span> {progressPercentage}%
                  </div>
                  <div className="text-base-content/70">
                    <span className="font-medium">{t('progress.mandatory')}:</span> {mandatoryProgressPercentage}%
                  </div>
                  <div className="text-base-content/70">
                    <span className="font-medium">{t('scores.compliance')}:</span> {typeof assessment.compliance_percentage === 'number' ? `${assessment.compliance_percentage.toFixed(1)}%` : '-'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scores - Only show if available */}
          {assessment.current_scores && assessment.status !== 'draft' && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-base-200 rounded">
                <div className="text-xs text-base-content/70">{t('scores.documentation')}</div>
                <div className="text-lg font-bold">{assessment.current_scores.average_documentation_score.toFixed(1)}</div>
              </div>
              <div className="text-center p-2 bg-base-200 rounded">
                <div className="text-xs text-base-content/70">{t('scores.implementation')}</div>
                <div className="text-lg font-bold">{assessment.current_scores.average_implementation_score.toFixed(1)}</div>
              </div>
            </div>
          )}

          {/* Footer with Last Activity */}
          <div className="mt-auto pt-4 border-t border-base-200">
            <div className="flex items-center gap-1 text-xs text-base-content/50">
              <User className="h-3 w-3" />
              <span>
                {t('lastEditedBy', { 
                  user: assessment.updated_by || t('unknownUser', { defaultValue: 'Unknown' }),
                  date: format(new Date(assessment.updated_at), 'dd.MM.yyyy HH:mm', { locale: hr })
                })}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <div className="card-actions justify-end mt-4">
            {assessment.status === 'completed' ? (
              <Link href={`/hr/assessments/${assessment.id}/results`} className="btn btn-primary btn-sm">
                {t('actions.viewResults')}
              </Link>
            ) : (
              <Link href={`/hr/assessments/${assessment.id}/questionnaire`} className="btn btn-primary btn-sm">
                {t('actions.continue')}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t('deleteDialog.title')}</h3>
                <p className="text-sm text-base-content/70">
                  {t('deleteDialog.subtitle')}
                </p>
              </div>
            </div>
            
            <div className="py-4">
              <p className="text-base-content">
                {t('deleteDialog.message', { title: assessment.title })}
              </p>
              <p className="text-sm text-base-content/70 mt-2">
                {t('deleteDialog.warning')}
              </p>
            </div>

            <div className="modal-action">
              <button 
                type="button" 
                className="btn btn-outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                {t('deleteDialog.cancel')}
              </button>
              <button 
                type="button" 
                className="btn btn-error"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    {t('deleteDialog.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    {t('deleteDialog.confirm')}
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !isDeleting && setShowDeleteModal(false)}></div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0">
                <Archive className="h-8 w-8 text-info" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t('archiveDialog.title')}</h3>
                <p className="text-sm text-base-content/70">
                  {t('archiveDialog.subtitle')}
                </p>
              </div>
            </div>
            
            <div className="py-4">
              <p className="text-base-content">
                {t('archiveDialog.message', { title: assessment.title })}
              </p>
              <p className="text-sm text-base-content/70 mt-2">
                {t('archiveDialog.info')}
              </p>
            </div>

            <div className="modal-action">
              <button 
                type="button" 
                className="btn btn-outline"
                onClick={() => setShowArchiveModal(false)}
                disabled={isArchiving}
              >
                {t('archiveDialog.cancel')}
              </button>
              <button 
                type="button" 
                className="btn btn-info"
                onClick={confirmArchive}
                disabled={isArchiving}
              >
                {isArchiving ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    {t('archiveDialog.archiving')}
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    {t('archiveDialog.confirm')}
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !isArchiving && setShowArchiveModal(false)}></div>
        </div>
      )}
    </>
  )
}