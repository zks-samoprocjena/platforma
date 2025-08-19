'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Shield, TrendingUp } from 'lucide-react'
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

interface ControlPriorityBarProps {
  assessmentId?: string
  loading?: boolean
  isIncomplete?: boolean
}

interface PriorityData {
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
  statistics: {
    mandatory: {
      count: number
      documentation_average: number
      implementation_average: number
      score_distribution: Record<number, number>
    }
    voluntary: {
      count: number
      documentation_average: number
      implementation_average: number
      score_distribution: Record<number, number>
    }
  }
}

export function ControlPriorityBar({ 
  assessmentId, 
  loading: parentLoading,
  isIncomplete = false
}: ControlPriorityBarProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()

  // Fetch priority data
  const { data: priorityData, isLoading, error } = useQuery({
    queryKey: ['assessment-control-priority', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<PriorityData>(
        `/api/v1/assessments/${assessmentId}/control-priority-bar?locale=${locale}`
      )
      return response
    },
    enabled: !!assessmentId
  })

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}/5`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 5,
        ticks: {
          stepSize: 1
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
          <div className="bg-base-300 rounded h-64"></div>
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
            {t('controlPriority.selectAssessment')}
          </p>
        </div>
      </div>
    )
  }

  if (!priorityData) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <p className="text-base-content/50">
            {t('controlPriority.noData')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="assessment-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          {priorityData.title}
        </h3>
        <p className="text-sm text-base-content/70">{priorityData.description}</p>
      </div>
      
      <div className="space-y-4">
        {/* Bar Chart */}
        <div className="w-full h-64">
          <Bar data={priorityData.data} options={chartOptions} />
        </div>
        
        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-base-200/50 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-error">
              {priorityData.data.labels[0]}
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{t('controlPriority.count')}:</span>
                <span className="font-mono">{priorityData.statistics.mandatory.count}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('controlPriority.avgDoc')}:</span>
                <span className="font-mono">{priorityData.statistics.mandatory.documentation_average.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('controlPriority.avgImpl')}:</span>
                <span className="font-mono">{priorityData.statistics.mandatory.implementation_average.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-base-200/50 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2 text-info">
              {priorityData.data.labels[1]}
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{t('controlPriority.count')}:</span>
                <span className="font-mono">{priorityData.statistics.voluntary.count}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('controlPriority.avgDoc')}:</span>
                <span className="font-mono">{priorityData.statistics.voluntary.documentation_average.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('controlPriority.avgImpl')}:</span>
                <span className="font-mono">{priorityData.statistics.voluntary.implementation_average.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Score Distribution */}
        <div className="bg-base-200/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">{t('controlPriority.scoreDistribution')}</h4>
          <div className="grid grid-cols-6 gap-2 text-xs">
            {[0, 1, 2, 3, 4, 5].map(score => (
              <div key={score} className="text-center">
                <div className="font-mono font-semibold">{score}</div>
                <div className="text-error">
                  {priorityData.statistics.mandatory.score_distribution[score] || 0}
                </div>
                <div className="text-info">
                  {priorityData.statistics.voluntary.score_distribution[score] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}