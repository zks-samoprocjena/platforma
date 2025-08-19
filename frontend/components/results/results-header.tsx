'use client'

import { useTranslations } from 'next-intl'
import { Assessment, AssessmentResultsResponse } from '@/types/assessment'
import { ArrowLeftIcon, DocumentArrowDownIcon, ShareIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { getComplianceLevel, getSecurityLevelBadge } from '@/lib/assessment-helpers'

interface ResultsHeaderProps {
  assessment: Assessment
  results: AssessmentResultsResponse
}

export default function ResultsHeader({ assessment, results }: ResultsHeaderProps) {
  const t = useTranslations('results')
  const tCommon = useTranslations('common')

  const compliance = getComplianceLevel(results.compliance_percentage)

  return (
    <div className="bg-base-200 border-b border-base-300">
      <div className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link 
            href="/assessments" 
            className="flex items-center gap-1 text-base-content/60 hover:text-base-content"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {tCommon('navigation.assessments')}
          </Link>
          <span className="text-base-content/40">/</span>
          <span className="text-base-content">{assessment.title}</span>
          <span className="text-base-content/40">/</span>
          <span className="text-base-content font-medium">{t('title')}</span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Assessment Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-base-content">
                {assessment.title}
              </h1>
              <div className={`badge ${getSecurityLevelBadge(assessment.security_level)}`}>
                {tCommon(`securityLevels.${assessment.security_level}`)}
              </div>
            </div>
            
            <p className="text-base-content/70 mb-4">
              {assessment.description || t('defaultDescription')}
            </p>

            {/* Key Metrics */}
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-base-content/60">{t('metrics.completed')}:</span>
                <span className="ml-2 font-medium">
                  {new Date(assessment.completed_at || assessment.updated_at).toLocaleDateString('hr-HR')}
                </span>
              </div>
              <div>
                <span className="text-base-content/60">{t('metrics.controls')}:</span>
                <span className="ml-2 font-medium">
                  {results.statistics.answered_controls}/{results.statistics.total_controls}
                </span>
              </div>
              <div>
                <span className="text-base-content/60">{t('metrics.mandatory')}:</span>
                <span className="ml-2 font-medium">
                  {results.statistics.mandatory_answered}/{results.statistics.mandatory_controls}
                </span>
              </div>
            </div>
          </div>

          {/* Compliance Score */}
          <div className="flex flex-col lg:items-end gap-4">
            <div className="text-center lg:text-right">
              <div className="text-sm text-base-content/60 mb-1">
                {t('overallCompliance')}
              </div>
              <div className={`text-4xl font-bold ${compliance.color}`}>
                {results.compliance_percentage.toFixed(1)}%
              </div>
              <div className="text-sm text-base-content/70">
                {t(`complianceLevel.${compliance.level}`)}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button className="btn btn-outline btn-sm">
                <DocumentArrowDownIcon className="w-4 h-4" />
                {tCommon('actions.export')}
              </button>
              <button className="btn btn-outline btn-sm">
                <ShareIcon className="w-4 h-4" />
                {tCommon('actions.share')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}