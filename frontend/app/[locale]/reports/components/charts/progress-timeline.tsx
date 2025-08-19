'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Calendar, TrendingUp, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface ProgressTimelineProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface TimelineData {
  assessment_id: string
  timeline_matrix: {
    rows: string[]
    columns: string[]
    data: number[][]
  }
  measure_progress: {
    labels: string[]
    start_dates: (string | null)[]
    completion_dates: (string | null)[]
    duration_days: (number | null)[]
  }
  activity_summary: {
    total_days_active: number
    average_controls_per_day: number
    most_active_day: string
    least_active_day: string
  }
}

export function ProgressTimeline({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: ProgressTimelineProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()

  // Fetch timeline data
  const { data: timelineData, isLoading, error } = useQuery({
    queryKey: ['assessment-progress-timeline', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<TimelineData>(
        `/api/v1/assessments/${assessmentId}/progress-timeline?locale=${locale}`
      )
      return response
    },
    enabled: !!assessmentId
  })

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  // Get color for heatmap cell
  const getCellColor = (value: number) => {
    if (value === 0) return 'bg-base-200'
    if (value <= 25) return 'bg-blue-200'
    if (value <= 50) return 'bg-blue-400'
    if (value <= 75) return 'bg-blue-600'
    return 'bg-blue-800'
  }

  const getCellTextColor = (value: number) => {
    return value > 50 ? 'text-white' : 'text-base-content'
  }

  if (isLoadingData) {
    return (
      <div className="assessment-card p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-base-300 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-base-300 rounded w-2/3 mb-4"></div>
          <div className="bg-base-300 rounded h-64"></div>
        </div>
      </div>
    )
  }

  if (errorData) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-error">{errorData.message}</p>
        </div>
      </div>
    )
  }

  if (!assessmentId) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-base-content/50">
            {t('progressTimeline.selectAssessment')}
          </p>
        </div>
      </div>
    )
  }

  if (!timelineData || !timelineData.timeline_matrix.data.length) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-base-content/50">
            {t('progressTimeline.noData')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="assessment-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t('progressTimeline.title')}</h3>
        <p className="text-sm text-base-content/70">{t('progressTimeline.description')}</p>
      </div>
      
      <div className="space-y-6">
        {/* Activity Heatmap */}
        <div className="w-full">
          <h4 className="text-sm font-semibold mb-3">{t('progressTimeline.activityPattern')}</h4>
          <div className="overflow-x-auto rounded-lg border border-base-300 p-4 bg-base-100">
            <table className="table-compact">
              <thead>
                <tr>
                  <th className="text-xs text-left p-2 w-20"></th>
                  {timelineData.timeline_matrix.columns.map((day) => (
                    <th key={day} className="text-xs font-medium text-center p-1">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timelineData.timeline_matrix.data.map((weekData, weekIndex) => (
                  <tr key={`week-${weekIndex}`}>
                    <td className="text-xs font-medium p-2">
                      {timelineData.timeline_matrix.rows[weekIndex]}
                    </td>
                    {weekData.map((value, dayIndex) => (
                      <td key={`day-${weekIndex}-${dayIndex}`} className="p-1">
                        <div className="flex justify-center">
                          <div 
                            className={`w-9 h-9 rounded flex items-center justify-center ${getCellColor(value)} ${getCellTextColor(value)}`}
                            title={`Activity: ${value}%`}
                          >
                            {value > 0 && <span className="text-xs font-semibold">{value}</span>}
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs">
            <span>{t('progressTimeline.legend')}:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-base-200 rounded"></div>
              <span>{t('progressTimeline.noActivity')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-blue-200 rounded"></div>
              <span>{t('progressTimeline.low')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-blue-400 rounded"></div>
              <span>{t('progressTimeline.medium')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-blue-600 rounded"></div>
              <span>{t('progressTimeline.high')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-blue-800 rounded"></div>
              <span>{t('progressTimeline.veryHigh')}</span>
            </div>
          </div>
        </div>

        {/* Measure Progress Timeline */}
        <div className="w-full rounded-lg border border-base-300 p-4 bg-base-100">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('progressTimeline.measureProgress')}
          </h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {timelineData.measure_progress.labels.map((measure, index) => {
              const duration = timelineData.measure_progress.duration_days[index]
              const isComplete = timelineData.measure_progress.completion_dates[index] !== null
              
              return (
                <div key={`measure-${measure}-${index}`} className="flex items-center gap-3 p-3 bg-base-200/30 rounded-lg">
                  <span className="font-mono text-sm font-semibold w-14 text-center">{measure}</span>
                  <div className="flex-1 min-w-0">
                    <div className="h-2 bg-base-300 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${isComplete ? 'bg-success' : 'bg-warning'}`}
                        style={{ width: isComplete ? '100%' : '50%' }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-base-content/70 min-w-fit">
                    {duration !== null ? (
                      <span className="whitespace-nowrap">{duration} {t('progressTimeline.days')}</span>
                    ) : (
                      <span className="whitespace-nowrap">{t('progressTimeline.inProgress')}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
          <div className="stat">
            <div className="stat-figure text-primary">
              <Calendar className="h-8 w-8" />
            </div>
            <div className="stat-title">{t('progressTimeline.totalDaysActive')}</div>
            <div className="stat-value text-2xl">
              {timelineData.activity_summary.total_days_active}
            </div>
          </div>
          
          <div className="stat">
            <div className="stat-figure text-secondary">
              <TrendingUp className="h-8 w-8" />
            </div>
            <div className="stat-title">{t('progressTimeline.avgControlsPerDay')}</div>
            <div className="stat-value text-2xl">
              {timelineData.activity_summary.average_controls_per_day}
            </div>
          </div>
          
          <div className="stat">
            <div className="stat-figure text-accent">
              <Clock className="h-8 w-8" />
            </div>
            <div className="stat-title">{t('progressTimeline.peakActivity')}</div>
            <div className="stat-value text-lg">
              {new Date(timelineData.activity_summary.most_active_day).toLocaleDateString(locale)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}