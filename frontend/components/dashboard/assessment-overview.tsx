'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  EyeIcon,
  PencilIcon,
  PlayIcon
} from '@heroicons/react/24/outline'
import { useAssessments } from '@/hooks/api/use-assessments'
import { APIErrorBoundary } from '@/components/error-boundary'

export default function AssessmentOverview() {
  const t = useTranslations('Assessment')
  const tDashboard = useTranslations('Dashboard')
  const params = useParams()
  const locale = params.locale as string

  const { data: assessmentsData, isLoading, error } = useAssessments({ 
    per_page: 5,
    status: undefined // Get all statuses
  })

  const recentAssessments = assessmentsData?.items || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success text-success-content'
      case 'in_progress':
        return 'bg-warning text-warning-content'
      case 'draft':
        return 'bg-info text-info-content'
      case 'review':
        return 'bg-primary text-primary-content'
      default:
        return 'bg-base-300 text-base-content'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return tDashboard('status.completed')
      case 'in_progress':
        return tDashboard('status.inProgress')
      case 'draft':
        return tDashboard('status.draft')
      case 'review':
        return tDashboard('status.review')
      default:
        return status
    }
  }

  const getActionForStatus = (assessment: any) => {
    switch (assessment.status) {
      case 'completed':
        return {
          label: tDashboard('actions.viewResults'),
          href: `/${locale}/assessments/${assessment.id}/results`,
          icon: EyeIcon,
          color: 'btn-outline'
        }
      case 'in_progress':
        return {
          label: tDashboard('actions.continue'),
          href: `/${locale}/assessments/${assessment.id}/questionnaire`,
          icon: PlayIcon,
          color: 'btn-primary'
        }
      case 'draft':
        return {
          label: tDashboard('actions.edit'),
          href: `/${locale}/assessments/${assessment.id}/questionnaire`,
          icon: PencilIcon,
          color: 'btn-outline'
        }
      default:
        return {
          label: tDashboard('actions.open'),
          href: `/${locale}/assessments/${assessment.id}/questionnaire`,
          icon: EyeIcon,
          color: 'btn-outline'
        }
    }
  }

  if (error) {
    return (
      <APIErrorBoundary>
        <div>Error loading assessments</div>
      </APIErrorBoundary>
    )
  }

  return (
    <div className="bg-base-100 rounded-lg shadow-sm border border-base-300 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-base-content">
          {tDashboard('recentAssessments')}
        </h2>
        <Link 
          href={`/${locale}/assessments`}
          className="text-sm text-primary hover:text-primary-focus"
        >
          {tDashboard('viewAll')}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-base-200 rounded-lg p-4">
                <div className="h-4 bg-base-300 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-base-300 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-base-300 rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : recentAssessments.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-base-content/60 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-base-content/70 mb-4">{tDashboard('noAssessments')}</p>
          <Link
            href={`/${locale}/assessments/new`}
            className="btn btn-primary btn-sm"
          >
            {tDashboard('startFirst')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {recentAssessments.map((assessment) => {
            const action = getActionForStatus(assessment)
            
            return (
              <div 
                key={assessment.id} 
                className="bg-base-50 rounded-lg p-4 hover:bg-base-100 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-base-content truncate">
                      {assessment.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`
                        inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                        ${getStatusColor(assessment.status)}
                      `}>
                        {getStatusLabel(assessment.status)}
                      </span>
                      <span className="text-xs text-base-content/60 capitalize">
                        {assessment.security_level}
                      </span>
                    </div>
                    {(assessment.progress || (assessment.total_controls && assessment.total_controls > 0)) && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-base-content/60 mb-1">
                          <span>{tDashboard('progress')}</span>
                          <span>
                            {assessment.progress 
                              ? Math.round(assessment.progress.completion_percentage) 
                              : assessment.total_controls > 0 
                                ? Math.round((assessment.answered_controls || 0) / assessment.total_controls * 100)
                                : 0}%
                          </span>
                        </div>
                        <div className="w-full bg-base-200 rounded-full h-1.5">
                          <div 
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ 
                              width: `${
                                assessment.progress 
                                  ? assessment.progress.completion_percentage 
                                  : assessment.total_controls > 0 
                                    ? Math.round((assessment.answered_controls || 0) / assessment.total_controls * 100)
                                    : 0
                              }%` 
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <Link
                      href={action.href}
                      className={`btn btn-xs ${action.color} gap-1`}
                    >
                      <action.icon className="h-3 w-3" />
                      {action.label}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}