'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Assessment, AssessmentResultsResponse, GapAnalysisItem, AssessmentInsights } from '@/types/assessment'
import { deriveGapsFromResults } from '@/lib/assessment-helpers'
import { 
  ExclamationTriangleIcon, 
  ClockIcon, 
  BoltIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline'

interface GapAnalysisProps {
  assessment: Assessment
  results: AssessmentResultsResponse
  insights?: AssessmentInsights
}

export default function GapAnalysis({ assessment, results, insights }: GapAnalysisProps) {
  const t = useTranslations('results.gaps')
  const [selectedPriority, setSelectedPriority] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all')
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'mandatory' | 'implementation' | 'documentation'>('all')

  const normalizeInsightsGaps = (gaps: any[]): GapAnalysisItem[] => {
    const effortForPriority = (p: string): 'high' | 'medium' | 'low' => {
      if (p === 'critical' || p === 'high') return 'high'
      if (p === 'medium') return 'medium'
      return 'low'
    }
    const weeksForPriority = (p: string): number => {
      if (p === 'critical') return 4
      if (p === 'high') return 6
      if (p === 'medium') return 8
      return 12
    }
    return (gaps || []).map((g, idx) => {
      const priority = (g.priority as string) || 'high'
      const current = Number.isFinite(Number(g.current_score)) ? Number(g.current_score) : 0
      const target = Number.isFinite(Number(g.target_score)) ? Number(g.target_score) : (priority === 'critical' ? 3 : 2.5)
      const gapScore = Math.max(0, Number((target - current).toFixed(2)))
      const rec = g.recommendation ? [String(g.recommendation)] : []
      return {
        id: String(g.control_id ?? g.control_code ?? `gap-${idx}`),
        control_id: String(g.control_id ?? ''),
        control_title: String(g.control_name ?? g.control_code ?? 'Control'),
        measure_title: String((g.control_code || '').split('.')[0] || ''),
        priority: priority as any,
        category: g.is_mandatory ? 'mandatory' : 'implementation',
        current_score: current,
        target_score: target,
        gap_score: gapScore,
        effort_estimate: effortForPriority(priority),
        timeline_weeks: weeksForPriority(priority),
        impact_description: g.is_mandatory
          ? 'Kritična obavezna kontrola ne zadovoljava minimalne zahtjeve.'
          : 'Kontrola zahtijeva poboljšanje za višu usklađenost.',
        recommendations: rec,
      }
    })
  }

  const gapItems: GapAnalysisItem[] =
    Array.isArray((insights as any)?.gaps)
      ? normalizeInsightsGaps(((insights as any).gaps) as any[])
      : (deriveGapsFromResults(results) || [])

  const filteredGaps = (gapItems || []).filter(gap => {
    const priorityMatch = selectedPriority === 'all' || gap.priority === selectedPriority
    const categoryMatch = selectedCategory === 'all' || gap.category === selectedCategory
    return priorityMatch && categoryMatch
  })

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical': return ExclamationTriangleIcon
      case 'high': return BoltIcon
      case 'medium': return ChartBarIcon
      case 'low': return ClockIcon
      default: return ChartBarIcon
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-error'
      case 'high': return 'text-warning'
      case 'medium': return 'text-info'
      case 'low': return 'text-base-content/60'
      default: return 'text-base-content'
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical': return 'badge-error'
      case 'high': return 'badge-warning'
      case 'medium': return 'badge-info'
      case 'low': return 'badge-neutral'
      default: return 'badge-neutral'
    }
  }

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case 'high': return 'badge-error badge-outline'
      case 'medium': return 'badge-warning badge-outline'
      case 'low': return 'badge-success badge-outline'
      default: return 'badge-neutral badge-outline'
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title mb-4">{t('title')}</h3>
          
          <div className="flex flex-wrap gap-4">
            {/* Priority Filter */}
            <div>
              <label className="label">
                <span className="label-text">{t('filters.priority')}</span>
              </label>
              <select 
                className="select select-bordered select-sm"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value as any)}
              >
                <option value="all">{t('filters.all')}</option>
                <option value="critical">{t('priority.critical')}</option>
                <option value="high">{t('priority.high')}</option>
                <option value="medium">{t('priority.medium')}</option>
                <option value="low">{t('priority.low')}</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="label">
                <span className="label-text">{t('filters.category')}</span>
              </label>
              <select 
                className="select select-bordered select-sm"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
              >
                <option value="all">{t('filters.all')}</option>
                <option value="mandatory">{t('category.mandatory')}</option>
                <option value="implementation">{t('category.implementation')}</option>
                <option value="documentation">{t('category.documentation')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Gap Items */}
      <div className="space-y-4">
        {filteredGaps.map((gap, index) => {
          const PriorityIcon = getPriorityIcon(gap.priority)
          const progressPercent = gap && (gap as any).target_score > 0
            ? ((gap as any).current_score / (gap as any).target_score) * 100
            : 0
          const rawKey = (gap as any).id ?? (gap as any).control_id ?? (gap as any).control_code ?? 'gap'
          const itemKey = `${String(rawKey)}-${index}`
          
          return (
            <div key={itemKey} className="card bg-base-100 shadow-lg">
              <div className="card-body">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <PriorityIcon className={`w-6 h-6 ${getPriorityColor(gap.priority)} mt-1`} />
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-base-content">
                          {gap.control_title}
                        </h4>
                        <div className={`badge ${getPriorityBadge(gap.priority)} badge-sm`}>
                          {t(`priority.${gap.priority}`)}
                        </div>
                        <div className={`badge ${getEffortBadge((gap as any).effort_estimate)} badge-sm`}>
                          {t(`effort.${(gap as any).effort_estimate ?? 'undefined'}`)}
                        </div>
                      </div>
                      
                      <p className="text-sm text-base-content/70 mb-2">
                        {gap.measure_title}
                      </p>
                      
                      <p className="text-sm text-base-content/80">
                        {gap.impact_description}
                      </p>
                    </div>
                  </div>
 
                  <div className="text-right min-w-[120px]">
                    <div className="text-sm text-base-content/60 mb-1">
                      {t('gapScore')}
                    </div>
                    <div className="text-2xl font-bold text-error">
                      -{(gap as any).gap_score}
                    </div>
                    <div className="text-xs text-base-content/60">
                      {(gap as any).current_score} → {(gap as any).target_score}
                    </div>
                  </div>
                </div>
 
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{t('currentProgress')}</span>
                    <span>{Math.max(0, Math.min(100, Number.isFinite(progressPercent) ? Math.round(progressPercent) : 0))}%</span>
                  </div>
                  <progress 
                    className="progress progress-error w-full" 
                    value={(gap as any).current_score ?? 0} 
                    max={(gap as any).target_score ?? 1}
                  />
                </div>
 
                {/* Timeline */}
                <div className="flex items-center gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1">
                    <ClockIcon className="w-4 h-4 text-base-content/60" />
                    <span className="text-base-content/70">
                      {t('estimatedTime')}: {(gap as any).timeline_weeks ?? '—'} {t('weeks')}
                    </span>
                  </div>
                </div>
 
                {/* Recommendations */}
                <div>
                  <h5 className="font-medium text-base-content mb-2">
                    {t('recommendations')}:
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-sm text-base-content/80 ml-4">
                    {(Array.isArray((gap as any).recommendations)
                      ? (gap as any).recommendations
                      : (gap as any).recommendations
                      ? [gap.recommendations]
                      : []
                    ).map((recommendation, recIndex) => (
                      <li key={`${itemKey}-rec-${recIndex}`}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredGaps.length === 0 && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body text-center py-12">
            <ChartBarIcon className="w-16 h-16 text-base-content/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-base-content mb-2">
              {t('noGaps.title')}
            </h3>
            <p className="text-base-content/70">
              {t('noGaps.description')}
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h4 className="text-lg font-semibold mb-4">{t('summary.title')}</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-error">
                {gapItems.filter(g => g.priority === 'critical').length}
              </div>
              <div className="text-sm text-base-content/70">
                {t('priority.critical')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {gapItems.filter(g => g.priority === 'high').length}
              </div>
              <div className="text-sm text-base-content/70">
                {t('priority.high')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-info">
                {gapItems.filter(g => g.priority === 'medium').length}
              </div>
              <div className="text-sm text-base-content/70">
                {t('priority.medium')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-base-content/60">
                {gapItems.filter(g => g.priority === 'low').length}
              </div>
              <div className="text-sm text-base-content/70">
                {t('priority.low')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}