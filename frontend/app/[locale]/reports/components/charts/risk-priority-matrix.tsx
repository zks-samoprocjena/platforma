'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Target, AlertTriangle, TrendingUp, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Scatter } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js'

// Register Chart.js components
ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend)

interface RiskPriorityMatrixProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface MatrixData {
  assessment_id: string
  security_level: string
  matrix: {
    x_axis: string
    y_axis: string
    quadrants: {
      quick_wins: {
        label: string
        controls: any[]
      }
      major_projects: {
        label: string
        controls: any[]
      }
      fill_ins: {
        label: string
        controls: any[]
      }
      thankless_tasks: {
        label: string
        controls: any[]
      }
    }
  }
  scatter_data: Array<{
    x: number
    y: number
    label: string
    color: string
  }>
  summary: {
    total_controls_needing_work: number
    quick_wins_count: number
    major_projects_count: number
    fill_ins_count: number
    thankless_tasks_count: number
  }
}

export function RiskPriorityMatrix({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: RiskPriorityMatrixProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()

  // Fetch matrix data
  const { data: matrixData, isLoading, error } = useQuery({
    queryKey: ['assessment-risk-matrix', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<MatrixData>(
        `/api/v1/assessments/${assessmentId}/risk-priority-matrix?locale=${locale}`
      )
      return response
    },
    enabled: !!assessmentId
  })

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  // Prepare scatter chart data
  const chartData = {
    datasets: [
      {
        label: t('riskMatrix.mandatoryControls'),
        data: matrixData?.scatter_data.filter(d => d.color === '#ef4444').map(d => ({ x: d.x, y: d.y })) || [],
        backgroundColor: '#ef4444',
        borderColor: '#ef4444',
        pointRadius: 6,
      },
      {
        label: t('riskMatrix.voluntaryControls'),
        data: matrixData?.scatter_data.filter(d => d.color === '#3b82f6').map(d => ({ x: d.x, y: d.y })) || [],
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
        pointRadius: 6,
      }
    ]
  }

  const chartOptions: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const point = matrixData?.scatter_data.find(
              d => d.x === context.parsed.x && d.y === context.parsed.y
            )
            return point ? point.label : ''
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: t('riskMatrix.implementationEffort')
        },
        min: 0,
        max: 100,
        grid: {
          drawBorder: true,
          color: (context) => {
            return context.tick.value === 50 ? '#000' : 'rgba(0, 0, 0, 0.1)'
          },
          lineWidth: (context) => {
            return context.tick.value === 50 ? 2 : 1
          }
        }
      },
      y: {
        title: {
          display: true,
          text: t('riskMatrix.riskCriticality')
        },
        min: 0,
        max: 100,
        grid: {
          drawBorder: true,
          color: (context) => {
            return context.tick.value === 50 ? '#000' : 'rgba(0, 0, 0, 0.1)'
          },
          lineWidth: (context) => {
            return context.tick.value === 50 ? 2 : 1
          }
        }
      }
    }
  }

  const getQuadrantIcon = (quadrant: string) => {
    switch (quadrant) {
      case 'quick_wins': return <Zap className="h-5 w-5 text-success" />
      case 'major_projects': return <Target className="h-5 w-5 text-error" />
      case 'fill_ins': return <TrendingUp className="h-5 w-5 text-info" />
      case 'thankless_tasks': return <AlertTriangle className="h-5 w-5 text-warning" />
      default: return null
    }
  }

  const getQuadrantColor = (quadrant: string) => {
    switch (quadrant) {
      case 'quick_wins': return 'bg-success/10 border-success'
      case 'major_projects': return 'bg-error/10 border-error'
      case 'fill_ins': return 'bg-info/10 border-info'
      case 'thankless_tasks': return 'bg-warning/10 border-warning'
      default: return 'bg-base-200'
    }
  }

  if (isLoadingData) {
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
            {t('riskMatrix.selectAssessment')}
          </p>
        </div>
      </div>
    )
  }

  if (!matrixData || matrixData.scatter_data.length === 0) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <div className="text-center">
            <p className="text-base-content/50 mb-2">
              {t('riskMatrix.noControlsNeedWork')}
            </p>
            <p className="text-sm text-success">
              {t('riskMatrix.allControlsCompliant')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="assessment-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t('riskMatrix.title')}</h3>
        <p className="text-sm text-base-content/70">{t('riskMatrix.description')}</p>
      </div>
      
      <div className="space-y-6">
        {/* Scatter Plot */}
        <div className="w-full overflow-hidden rounded-lg border border-base-300 p-4 bg-base-100">
          <div className="w-full h-[400px]">
            <Scatter data={chartData} options={chartOptions} />
          </div>
        </div>
        
        {/* Quadrant Legend */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-success rounded"></div>
            <span>{matrixData?.matrix.quadrants.quick_wins.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-error rounded"></div>
            <span>{matrixData?.matrix.quadrants.major_projects.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-info rounded"></div>
            <span>{matrixData?.matrix.quadrants.fill_ins.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-warning rounded"></div>
            <span>{matrixData?.matrix.quadrants.thankless_tasks.label}</span>
          </div>
        </div>

        {/* Quadrant Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(matrixData?.matrix.quadrants || {}).map(([key, quadrant]) => (
            <div 
              key={key} 
              className={`card border-2 ${getQuadrantColor(key)}`}
            >
              <div className="card-body p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getQuadrantIcon(key)}
                    <h4 className="font-semibold">{quadrant.label}</h4>
                  </div>
                  <span className="badge badge-lg">{quadrant.controls.length}</span>
                </div>
                
                {quadrant.controls.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-base-content/70 mb-2">
                      {t('riskMatrix.topControls')}:
                    </p>
                    <ul className="text-xs space-y-1">
                      {quadrant.controls.slice(0, 3).map((control: any, idx: number) => (
                        <li key={`${key}-${control.control_id}-${idx}`} className="flex items-center gap-2">
                          <span className="font-mono">{control.control_code}</span>
                          {control.is_mandatory && (
                            <span className="badge badge-error badge-xs">M</span>
                          )}
                        </li>
                      ))}
                      {quadrant.controls.length > 3 && (
                        <li className="text-base-content/50">
                          +{quadrant.controls.length - 3} {t('riskMatrix.more')}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary Statistics */}
        <div className="alert alert-info">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            <div>
              <h4 className="font-semibold">{t('riskMatrix.priorityRecommendation')}</h4>
              <p className="text-sm mt-1">
                {t('riskMatrix.focusOn', { 
                  count: matrixData?.summary.quick_wins_count || 0 
                })}
                {matrixData?.summary.major_projects_count > 0 && (
                  <span className="ml-1">
                    {t('riskMatrix.planFor', { 
                      count: matrixData?.summary.major_projects_count 
                    })}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}