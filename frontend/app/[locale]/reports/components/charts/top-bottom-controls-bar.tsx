'use client'

import { useTranslations, useLocale } from 'next-intl'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js'

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface TopBottomControlsBarProps {
  assessmentId?: string
  loading?: boolean
  isIncomplete?: boolean
}

interface ControlData {
  assessment_id: string
  title: string
  description: string
  data: {
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
      backgroundColor: string
      borderColor: string
      borderWidth: number
    }>
  }
  details: {
    top_controls: Array<{
      rank: number
      control_code: string
      control_name: string
      is_mandatory: boolean
      priority: string
      documentation_score: number
      implementation_score: number
      total_score: number
    }>
    bottom_controls: Array<{
      rank: number
      control_code: string
      control_name: string
      is_mandatory: boolean
      priority: string
      documentation_score: number
      implementation_score: number
      total_score: number
    }>
  }
}

export function TopBottomControlsBar({ 
  assessmentId, 
  loading: parentLoading,
  isIncomplete = false
}: TopBottomControlsBarProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()

  // Fetch top/bottom controls data
  const { data: controlsData, isLoading, error } = useQuery({
    queryKey: ['assessment-top-bottom-controls', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<ControlData>(
        `/api/v1/assessments/${assessmentId}/top-bottom-controls-bar?locale=${locale}&top_n=5`
      )
      return response
    },
    enabled: !!assessmentId
  })

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          afterLabel: (context) => {
            const index = context.dataIndex
            const isBottom = index < (controlsData?.details.bottom_controls.length || 0)
            const controls = isBottom ? controlsData?.details.bottom_controls : controlsData?.details.top_controls
            const controlIndex = isBottom ? index : index - (controlsData?.details.bottom_controls.length || 0)
            const control = controls?.[controlIndex]
            
            if (control) {
              return `${control.control_name}\n${control.priority}`
            }
            return ''
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 5,
        ticks: {
          stepSize: 1
        }
      },
      y: {
        ticks: {
          autoSkip: false,
          font: {
            size: 10
          }
        }
      }
    }
  }

  if (parentLoading || isLoading) {
    return (
      <div className="assessment-card p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-base-300 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-base-300 rounded w-2/3 mb-4"></div>
          <div className="bg-base-300 rounded h-96"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-error">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!assessmentId) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-base-content/50">
            {t('topBottomControls.selectAssessment')}
          </p>
        </div>
      </div>
    )
  }

  if (!controlsData) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-base-content/50">
            {t('topBottomControls.noData')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="assessment-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-success" />
          {controlsData.title}
        </h3>
        <p className="text-sm text-base-content/70">{controlsData.description}</p>
      </div>
      
      <div className="space-y-4">
        {/* Bar Chart */}
        <div className="w-full h-[400px]">
          <Bar data={controlsData.data} options={chartOptions} />
        </div>
        
        {/* Details Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bottom Controls */}
          <div className="bg-error/5 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-error" />
              {t('topBottomControls.needsImprovement')}
            </h4>
            <div className="space-y-2">
              {controlsData.details.bottom_controls.map((control, index) => (
                <div key={`bottom-${control.control_code}-${index}`} className="bg-base-100 rounded p-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{control.control_code}</span>
                        {control.is_mandatory && (
                          <span className="badge badge-error badge-xs">M</span>
                        )}
                      </div>
                      <p className="text-xs text-base-content/70 truncate">{control.control_name}</p>
                    </div>
                    <div className="text-xs text-right ml-2">
                      <div>D: {control.documentation_score}</div>
                      <div>I: {control.implementation_score}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Top Controls */}
          <div className="bg-success/5 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              {t('topBottomControls.bestPerforming')}
            </h4>
            <div className="space-y-2">
              {controlsData.details.top_controls.map((control, index) => (
                <div key={`top-${control.control_code}-${index}`} className="bg-base-100 rounded p-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{control.control_code}</span>
                        {control.is_mandatory && (
                          <span className="badge badge-error badge-xs">M</span>
                        )}
                      </div>
                      <p className="text-xs text-base-content/70 truncate">{control.control_name}</p>
                    </div>
                    <div className="text-xs text-right ml-2">
                      <div>D: {control.documentation_score}</div>
                      <div>I: {control.implementation_score}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Alert for critical controls */}
        {controlsData.details.bottom_controls.some(c => c.is_mandatory && c.total_score < 2) && (
          <div className="alert alert-error">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <h4 className="font-semibold">{t('topBottomControls.criticalAlert')}</h4>
              <p className="text-sm">
                {t('topBottomControls.criticalAlertDesc')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}