'use client'

import { useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData
} from 'chart.js'
import { Radar } from 'react-chartjs-2'
import { BaseChart } from './base-chart'
import { Download, Info } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

// Register Chart.js components
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
)

interface SecurityLevelProfileProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface SpiderData {
  assessment_id: string
  security_level: string
  documentation_vs_implementation: {
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
    }>
  }
  measure_compliance: {
    labels: string[]
    data: number[]
  }
  assessment_dimensions: {
    labels: string[]
    data: number[]
  }
}

export function SecurityLevelProfile({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: SecurityLevelProfileProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()
  const chartRef = useRef<ChartJS<'radar'>>(null)

  // Fetch spider diagram data
  const { data: spiderData, isLoading, error } = useQuery({
    queryKey: ['assessment-spider-data', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<SpiderData>(`/api/v1/assessments/${assessmentId}/spider-data?locale=${locale}`)
      return response
    },
    enabled: !!assessmentId
  })

  // Use documentation vs implementation data for this chart
  const chartData: ChartData<'radar'> = {
    labels: spiderData?.documentation_vs_implementation.labels || [],
    datasets: spiderData?.documentation_vs_implementation.datasets.map((dataset, index) => ({
      label: dataset.label,
      data: dataset.data,
      borderColor: index === 0 ? '#3b82f6' : '#10b981', // blue for doc, green for impl
      backgroundColor: index === 0 
        ? (isIncomplete ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)') 
        : (isIncomplete ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.2)'),
      borderWidth: 2,
      borderDash: isIncomplete ? [5, 5] : [], // Dashed lines for incomplete data
      pointBackgroundColor: index === 0 ? '#3b82f6' : '#10b981',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: index === 0 ? '#3b82f6' : '#10b981',
    })) || []
  }

  // Chart options
  const options: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const value = context.parsed.r
            return `${context.dataset.label}: ${value.toFixed(2)}/5.0`
          }
        }
      }
    },
    scales: {
      r: {
        min: 0,
        max: 5,
        ticks: {
          stepSize: 1,
          backdropColor: 'transparent'
        },
        pointLabels: {
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    }
  }

  const handleExportChart = () => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'security-level-profile.png'
      link.href = url
      link.click()
    }
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('securityLevelProfile.title')}
        description={t('securityLevelProfile.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('securityLevelProfile.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (!spiderData || spiderData.documentation_vs_implementation.labels.length === 0) {
    return (
      <BaseChart
        title={t('securityLevelProfile.title')}
        description={t('securityLevelProfile.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('securityLevelProfile.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('securityLevelProfile.title')}
      description={t('securityLevelProfile.description')}
      loading={isLoadingData}
      error={errorData}
      actions={
        <>
          <button
            onClick={handleExportChart}
            className="btn btn-ghost btn-sm"
            title={t('common.exportChart')}
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="tooltip tooltip-left" data-tip={t('securityLevelProfile.help')}>
            <button className="btn btn-ghost btn-sm btn-circle">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </>
      }
    >
      <div className="h-80">
        <Radar ref={chartRef} data={chartData} options={options} />
      </div>
    </BaseChart>
  )
}