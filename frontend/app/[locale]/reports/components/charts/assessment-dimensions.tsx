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

interface AssessmentDimensionsProps {
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

export function AssessmentDimensions({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: AssessmentDimensionsProps) {
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

  // Use assessment dimensions data for this chart
  const chartData: ChartData<'radar'> = {
    labels: spiderData?.assessment_dimensions.labels || [],
    datasets: [{
      label: t('assessmentDimensions.overallMaturity'),
      data: spiderData?.assessment_dimensions.data || [],
      borderColor: '#8b5cf6', // purple
      backgroundColor: isIncomplete ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.2)',
      borderWidth: 2,
      borderDash: isIncomplete ? [5, 5] : [], // Dashed lines for incomplete data
      pointBackgroundColor: '#8b5cf6',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#8b5cf6',
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  }

  // Chart options
  const options: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false // Hide legend for single dataset
      },
      tooltip: {
        mode: 'point',
        intersect: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const value = context.parsed.r
            const label = context.label || ''
            
            // Different formatting based on dimension
            if (label.includes('Compliance') || label.includes('Coverage')) {
              return `${label}: ${(value * 20).toFixed(1)}%`
            } else {
              return `${label}: ${value.toFixed(2)}/5.0`
            }
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
          callback: (value) => value.toString()
        },
        pointLabels: {
          font: {
            size: 12
          },
          callback: (label) => {
            // Wrap long labels
            const words = label.split(' ')
            if (words.length > 1) {
              const mid = Math.ceil(words.length / 2)
              return [
                words.slice(0, mid).join(' '),
                words.slice(mid).join(' ')
              ]
            }
            return label
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
          circular: true
        }
      }
    }
  }

  const handleExportChart = () => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'assessment-dimensions.png'
      link.href = url
      link.click()
    }
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('assessmentDimensions.title')}
        description={t('assessmentDimensions.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('assessmentDimensions.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (!spiderData || spiderData.assessment_dimensions.data.length === 0) {
    return (
      <BaseChart
        title={t('assessmentDimensions.title')}
        description={t('assessmentDimensions.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('assessmentDimensions.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  // Calculate overall maturity score
  const maturityScore = spiderData.assessment_dimensions.data.reduce((acc, val) => acc + val, 0) / 
                       spiderData.assessment_dimensions.data.length

  return (
    <BaseChart
      title={t('assessmentDimensions.title')}
      description={t('assessmentDimensions.description')}
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
          <div className="tooltip tooltip-left" data-tip={t('assessmentDimensions.help')}>
            <button className="btn btn-ghost btn-sm btn-circle">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {/* Overall Score Badge */}
        <div className="text-center">
          <div className="inline-flex flex-col items-center gap-1">
            <span className="text-sm text-base-content/70">{t('assessmentDimensions.overallScore')}</span>
            <span className={`text-3xl font-bold ${
              maturityScore >= 4 ? 'text-success' :
              maturityScore >= 3 ? 'text-info' :
              maturityScore >= 2 ? 'text-warning' :
              'text-error'
            }`}>
              {maturityScore.toFixed(2)}/5.0
            </span>
          </div>
        </div>
        
        {/* Radar Chart */}
        <div className="h-72">
          <Radar ref={chartRef} data={chartData} options={options} />
        </div>
      </div>
    </BaseChart>
  )
}