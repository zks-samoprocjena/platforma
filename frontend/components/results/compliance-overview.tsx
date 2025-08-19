'use client'

import { useTranslations } from 'next-intl'
import { Assessment, AssessmentResultsResponse } from '@/types/assessment'
import ComplianceGauge from './compliance-gauge'
import { ComplianceStatus } from '@/components/assessment/compliance-status'
import { ComplianceDetails } from '@/components/assessment/compliance-details'
import { 
  ChartBarIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  ClockIcon 
} from '@heroicons/react/24/outline'

interface ComplianceOverviewProps {
  assessment: Assessment
  results: AssessmentResultsResponse
}

export default function ComplianceOverview({ assessment, results }: ComplianceOverviewProps) {
  const t = useTranslations('results.overview')

  const stats = [
    {
      title: t('stats.totalControls'),
      value: results.statistics.total_controls || 0,
      icon: ChartBarIcon,
      color: 'text-info'
    },
    {
      title: t('stats.completed'),
      value: results.statistics.answered_controls || 0,
      icon: CheckCircleIcon,
      color: 'text-success'
    },
    {
      title: t('stats.mandatory'),
      value: `${results.statistics.mandatory_answered || 0}/${results.statistics.mandatory_controls || 0}`,
      icon: ExclamationTriangleIcon,
      color: 'text-warning'
    },
    {
      title: t('stats.pending'),
      value: Math.max(0, (results.statistics.total_controls || 0) - (results.statistics.answered_controls || 0)),
      icon: ClockIcon,
      color: 'text-base-content/60'
    }
  ]

  const completionRate = results.statistics.total_controls > 0 
    ? (results.statistics.answered_controls / results.statistics.total_controls) * 100 
    : 0
  const mandatoryRate = results.statistics.mandatory_controls > 0 
    ? (results.statistics.mandatory_answered / results.statistics.mandatory_controls) * 100 
    : 0

  return (
    <div className="space-y-8">
      {/* Compliance Status Overview */}
      {results.statistics.compliance && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ComplianceStatus 
            compliance={results.statistics.compliance}
          />
          <ComplianceDetails
            measures={results.measure_results}
            submeasures={results.submeasure_results}
            securityLevel={assessment.security_level}
          />
        </div>
      )}
      
      {/* Original Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Compliance Gauge */}
        <div className="lg:col-span-1">
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body items-center text-center">
              <h3 className="card-title mb-4">{t('complianceScore')}</h3>
              <ComplianceGauge 
                percentage={results.compliance_percentage}
                size="large"
              />
              <div className="mt-4 text-sm text-base-content/70">
                {t('complianceDescription')}
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {stats.map((stat, index) => (
            <div key={index} className="card bg-base-100 shadow-lg">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-sm text-base-content/70">{stat.title}</div>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Progress Bars */}
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <h4 className="text-lg font-semibold mb-4">{t('progressBreakdown')}</h4>
            
            <div className="space-y-4">
              {/* Overall Completion */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>{t('overallCompletion')}</span>
                  <span>{(isNaN(completionRate) ? 0 : completionRate).toFixed(1)}%</span>
                </div>
                <progress 
                  className="progress progress-info w-full" 
                  value={isNaN(completionRate) ? 0 : completionRate} 
                  max="100"
                />
              </div>

              {/* Mandatory Controls */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>{t('mandatoryControls')}</span>
                  <span>{(isNaN(mandatoryRate) ? 0 : mandatoryRate).toFixed(1)}%</span>
                </div>
                <progress 
                  className="progress progress-warning w-full" 
                  value={isNaN(mandatoryRate) ? 0 : mandatoryRate} 
                  max="100"
                />
              </div>

              {/* Compliance Score */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>{t('complianceScore')}</span>
                  <span>{(isNaN(results.compliance_percentage) ? 0 : results.compliance_percentage).toFixed(1)}%</span>
                </div>
                <progress 
                  className="progress progress-success w-full" 
                  value={isNaN(results.compliance_percentage) ? 0 : results.compliance_percentage} 
                  max="100"
                />
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}