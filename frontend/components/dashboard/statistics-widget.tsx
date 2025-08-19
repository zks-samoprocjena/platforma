'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { 
  ChartBarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { useAssessments } from '@/hooks/api/use-assessments'

export default function StatisticsWidget() {
  const t = useTranslations('Dashboard')

  // Get real data from API
  const { data: allAssessments } = useAssessments({ per_page: 100 })
  const { data: completedAssessments } = useAssessments({ 
    status: 'completed',
    per_page: 100 
  })
  const { data: inProgressAssessments } = useAssessments({ 
    status: 'in_progress',
    per_page: 100 
  })

  // Calculate statistics
  const totalCount = allAssessments?.total || 0
  const completedCount = completedAssessments?.total || 0
  const inProgressCount = inProgressAssessments?.total || 0
  
  // Calculate average compliance from completed assessments
  const averageCompliance = completedAssessments?.items && completedAssessments.items.length > 0
    ? Math.round(
        completedAssessments.items.reduce((sum, assessment) => 
          sum + (assessment.current_scores?.compliance_score || 0), 0
        ) / completedAssessments.items.length
      )
    : 0

  // Count improvement areas (measures with scores < 3)
  const improvementAreas = allAssessments?.items?.reduce((count, assessment) => {
    if (assessment.current_scores?.by_measure) {
      const lowScoreMeasures = Object.values(assessment.current_scores.by_measure)
        .filter(measure => measure.compliance_score < 60)
        .length
      return count + lowScoreMeasures
    }
    return count
  }, 0) || 0

  const stats = [
    {
      name: t('statistics.totalAssessments'),
      value: totalCount.toString(),
      change: inProgressCount > 0 ? `${inProgressCount} ${t('statistics.inProgress')}` : t('statistics.noActive'),
      changeType: 'positive' as const,
      icon: ChartBarIcon,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      loading: !allAssessments
    },
    {
      name: t('statistics.completedAssessments'),
      value: completedCount.toString(),
      change: totalCount > 0 ? `${Math.round((completedCount / totalCount) * 100)}% ${t('statistics.ofTotal')}` : '0%',
      changeType: 'positive' as const,
      icon: CheckCircleIcon,
      color: 'text-success',
      bgColor: 'bg-success/10',
      loading: !completedAssessments
    },
    {
      name: t('statistics.averageCompliance'),
      value: `${averageCompliance}%`,
      change: averageCompliance >= 70 ? t('statistics.good') : t('statistics.needsImprovement'),
      changeType: averageCompliance >= 70 ? 'positive' : 'negative',
      icon: ClockIcon,
      color: averageCompliance >= 70 ? 'text-success' : 'text-warning',
      bgColor: averageCompliance >= 70 ? 'bg-success/10' : 'bg-warning/10',
      loading: !completedAssessments
    },
    {
      name: t('statistics.improvementAreas'),
      value: improvementAreas.toString(),
      change: improvementAreas > 0 ? t('statistics.measures') : t('statistics.excellent'),
      changeType: improvementAreas === 0 ? 'positive' : 'negative',
      icon: ExclamationTriangleIcon,
      color: improvementAreas > 0 ? 'text-error' : 'text-success',
      bgColor: improvementAreas > 0 ? 'bg-error/10' : 'bg-success/10',
      loading: !allAssessments
    }
  ]

  // Calculate compliance by security level
  const complianceByLevel = React.useMemo(() => {
    const levels = {
      osnovna: { total: 0, completed: 0, score: 0, count: 0 },
      srednja: { total: 0, completed: 0, score: 0, count: 0 },
      napredna: { total: 0, completed: 0, score: 0, count: 0 }
    }

    allAssessments?.items?.forEach(assessment => {
      const level = assessment.security_level
      if (level in levels) {
        levels[level].count++
        if (assessment.progress) {
          levels[level].total += assessment.progress.total_controls
          levels[level].completed += assessment.progress.completed_controls
        }
        if (assessment.current_scores) {
          levels[level].score += assessment.current_scores.compliance_score
        }
      }
    })

    // Calculate averages
    Object.keys(levels).forEach(level => {
      const data = levels[level as keyof typeof levels]
      if (data.count > 0) {
        data.score = Math.round(data.score / data.count)
      }
    })

    return levels
  }, [allAssessments])

  return (
    <div className="bg-base-100 rounded-lg shadow-sm border border-base-300 p-6">
      <h2 className="text-lg font-semibold text-base-content mb-6">
        {t('overview')}
      </h2>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-base-50 rounded-lg p-4">
            <div className="flex items-center">
              <div className={`flex-shrink-0 p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
              </div>
              <div className="ml-4 flex-1 min-w-0">
                {stat.loading ? (
                  <>
                    <div className="skeleton h-8 w-16 mb-1"></div>
                    <div className="skeleton h-4 w-24"></div>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-base-content">{stat.value}</p>
                    <p className="text-sm text-base-content/70 truncate">{stat.name}</p>
                    {stat.change && (
                      <p className={`text-xs mt-1 ${
                        stat.changeType === 'positive' 
                          ? 'text-success' 
                          : stat.changeType === 'negative'
                          ? 'text-error'
                          : 'text-base-content/60'
                      }`}>
                        {stat.change}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Compliance scores by level */}
      <div>
        <h3 className="text-base font-semibold text-base-content mb-4">
          {t('statistics.complianceByLevel')}
        </h3>
        
        <div className="space-y-4">
          {Object.entries(complianceByLevel).map(([level, data]) => {
            const percentage = data.total > 0 
              ? Math.round((data.completed / data.total) * 100)
              : 0
            
            return (
              <div key={level} className="bg-base-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`
                      w-3 h-3 rounded-full
                      ${level === 'osnovna' ? 'bg-success' : level === 'srednja' ? 'bg-warning' : 'bg-error'}
                    `} />
                    <span className="text-sm font-medium text-base-content capitalize">
                      {level} {t('statistics.level')}
                    </span>
                  </div>
                  <span className="text-sm text-base-content/70">
                    {data.count > 0 ? `${data.completed}/${data.total} ${t('statistics.controls')}` : t('statistics.noAssessments')}
                  </span>
                </div>
                
                <div className="w-full bg-base-200 rounded-full h-2 mb-2">
                  <div 
                    className={`
                      h-2 rounded-full transition-all duration-300
                      ${level === 'osnovna' ? 'bg-success' : level === 'srednja' ? 'bg-warning' : 'bg-error'}
                    `}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-base-content/60">
                    {percentage}% {t('statistics.completed')}
                  </span>
                  <span className={`
                    text-sm font-semibold
                    ${data.score >= 80 ? 'text-success' : data.score >= 60 ? 'text-warning' : 'text-error'}
                  `}>
                    {data.score}% {t('statistics.compliance')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}