'use client'

import { useRef } from 'react'
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
import { Download, Info, AlertTriangle } from 'lucide-react'
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

interface SubmeasureComplianceSpiderProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface SubmeasureSpiderData {
  assessment_id: string
  security_level: string
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    borderColor?: string
    backgroundColor?: string
    borderDash?: number[]
  }>
}

export function SubmeasureComplianceSpider({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: SubmeasureComplianceSpiderProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()
  const chartRef = useRef<ChartJS<'radar'>>(null)

  // Fetch submeasure compliance spider data
  const { data: spiderData, isLoading, error } = useQuery({
    queryKey: ['assessment-submeasure-spider', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<SubmeasureSpiderData>(
        `/api/v1/assessments/${assessmentId}/submeasure-compliance-spider?locale=${locale}`
      )
      return response
    },
    enabled: !!assessmentId
  })

  // Prepare chart data
  const chartData: ChartData<'radar'> = {
    labels: spiderData?.labels || [],
    datasets: spiderData?.datasets.map((dataset) => ({
      ...dataset,
      borderWidth: 2,
      pointBackgroundColor: dataset.borderColor,
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: dataset.borderColor,
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
          },
          generateLabels: (chart) => {
            const datasets = chart.data.datasets
            return datasets.map((dataset, i) => ({
              text: dataset.label || '',
              fillStyle: dataset.backgroundColor as string,
              strokeStyle: dataset.borderColor as string,
              lineWidth: 2,
              lineDash: dataset.borderDash || [],
              hidden: !chart.isDatasetVisible(i),
              index: i
            }))
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
            const label = context.dataset.label
            if (label === 'Minimum Required') {
              return `${label}: ${value.toFixed(1)}/5.0 (Required threshold)`
            }
            return `${label}: ${value.toFixed(2)}/5.0`
          },
          afterLabel: (context) => {
            if (context.datasetIndex === 0) { // Current Compliance dataset
              const currentValue = context.parsed.r
              const minRequired = chartData.datasets[1]?.data?.[context.dataIndex] as number || 3
              if (currentValue < minRequired) {
                return `⚠️ Below minimum requirement`
              }
            }
            return ''
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
          backdropColor: 'transparent',
          callback: (value) => {
            if (value === 3) return '3 (Min)'
            return value.toString()
          }
        },
        pointLabels: {
          font: {
            size: 10
          },
          callback: (label) => {
            // Truncate long labels
            if (typeof label === 'string' && label.length > 8) {
              return label.substring(0, 8) + '...'
            }
            return label
          }
        },
        grid: {
          color: (context) => {
            // Highlight the minimum threshold line
            if (context.tick.value === 3) {
              return 'rgba(239, 68, 68, 0.3)'
            }
            return 'rgba(0, 0, 0, 0.1)'
          },
          lineWidth: (context) => {
            if (context.tick.value === 3) {
              return 2
            }
            return 1
          }
        }
      }
    }
  }

  const handleExportChart = () => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'submeasure-compliance-spider.png'
      link.href = url
      link.click()
    }
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  // Count submeasures below minimum
  const belowMinimumCount = spiderData ? 
    spiderData.datasets[0]?.data.filter((value, index) => 
      value < (spiderData.datasets[1]?.data[index] || 3)
    ).length : 0

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('submeasureCompliance.title')}
        description={t('submeasureCompliance.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('submeasureCompliance.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (!spiderData || spiderData.labels.length === 0) {
    return (
      <BaseChart
        title={t('submeasureCompliance.title')}
        description={t('submeasureCompliance.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('submeasureCompliance.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('submeasureCompliance.title')}
      description={t('submeasureCompliance.description')}
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
          <div className="tooltip tooltip-left" data-tip={t('submeasureCompliance.help')}>
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
      
      {/* Warning badge for submeasures below minimum */}
      {belowMinimumCount > 0 && (
        <div className="mt-4 flex items-center gap-2 text-warning">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">
            {t('submeasureCompliance.belowMinimum', { count: belowMinimumCount })}
          </span>
        </div>
      )}
    </BaseChart>
  )
}