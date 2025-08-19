'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { BaseChart } from './base-chart'
import { Download, Filter } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface MeasureComparisonChartProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface MeasureScore {
  measure_id: string
  measure_code: string
  overall_score: number
  documentation_avg: number | null
  implementation_avg: number | null
  passes_compliance: boolean
  compliance_percentage: number
  critical_failures: number
  submeasures: any[]
}

export function MeasureComparisonChart({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: MeasureComparisonChartProps) {
  const t = useTranslations('Reports.charts')
  const chartRef = useRef<ChartJS<'bar'>>(null)
  const [showBreakdown, setShowBreakdown] = useState(true)

  // Fetch compliance data for the selected assessment
  const { data: complianceData, isLoading, error } = useQuery({
    queryKey: ['assessment-compliance', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get(`/api/v1/assessments/${assessmentId}/compliance`)
      return response // API client returns the data directly, not wrapped in {data: ...}
    },
    enabled: !!assessmentId
  })

  // Extract measure scores
  const measureScores: MeasureScore[] = complianceData?.measures || []

  // Prepare chart data
  const chartData: ChartData<'bar'> = {
    labels: measureScores.map(m => m.measure_code),
    datasets: showBreakdown ? [
      {
        label: t('measureComparison.documentation'),
        data: measureScores.map(m => m.documentation_avg ?? 0),
        backgroundColor: isIncomplete ? 'rgba(59, 130, 246, 0.3)' : '#3b82f6', // blue-500 with transparency for incomplete
        borderColor: '#2563eb', // blue-600
        borderWidth: isIncomplete ? 2 : 1,
        borderRadius: 4,
        borderDash: isIncomplete ? [5, 5] : undefined,
      },
      {
        label: t('measureComparison.implementation'),
        data: measureScores.map(m => m.implementation_avg ?? 0),
        backgroundColor: isIncomplete ? 'rgba(16, 185, 129, 0.3)' : '#10b981', // green-500 with transparency for incomplete
        borderColor: '#059669', // green-600
        borderWidth: isIncomplete ? 2 : 1,
        borderRadius: 4,
        borderDash: isIncomplete ? [5, 5] : undefined,
      }
    ] : [
      {
        label: t('measureComparison.overallScore'),
        data: measureScores.map(m => m.overall_score ?? 0),
        backgroundColor: measureScores.map(m => {
          const score = m.compliance_percentage || 0
          const baseColor = score >= 90 ? '#10b981' : // green-500
                           score >= 75 ? '#3b82f6' : // blue-500
                           score >= 60 ? '#f59e0b' : // amber-500
                           '#ef4444' // red-500
          return isIncomplete ? baseColor + '4D' : baseColor // Add 30% opacity for incomplete
        }),
        borderColor: measureScores.map(m => {
          const score = m.compliance_percentage || 0
          if (score >= 90) return '#059669' // green-600
          if (score >= 75) return '#2563eb' // blue-600
          if (score >= 60) return '#d97706' // amber-600
          return '#dc2626' // red-600
        }),
        borderWidth: isIncomplete ? 2 : 1,
        borderRadius: 4,
        borderDash: isIncomplete ? [5, 5] : undefined,
      }
    ]
  }

  // Chart options
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showBreakdown,
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
          title: (items) => {
            const measure = measureScores[items[0]?.dataIndex]
            return measure ? measure.measure_code : ''
          },
          label: (context) => {
            const value = context.parsed.y != null ? context.parsed.y.toFixed(1) : '0.0'
            return `${context.dataset.label}: ${value}/5.0`
          },
          afterLabel: (context) => {
            if (context.datasetIndex === 0 && showBreakdown) return
            const measure = measureScores[context.dataIndex]
            return measure && measure.compliance_percentage != null 
              ? `${t('measureComparison.compliance')}: ${measure.compliance_percentage.toFixed(1)}%` 
              : ''
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        max: 5,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          stepSize: 1,
          callback: (value) => typeof value === 'number' ? value.toFixed(1) : value
        }
      }
    }
  }

  const handleExportChart = () => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'measure-comparison.png'
      link.href = url
      link.click()
    }
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('measureComparison.title')}
        description={t('measureComparison.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('measureComparison.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (measureScores.length === 0 && !isLoadingData) {
    return (
      <BaseChart
        title={t('measureComparison.title')}
        description={t('measureComparison.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('measureComparison.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('measureComparison.title')}
      description={t('measureComparison.description')}
      loading={isLoadingData}
      error={errorData}
      actions={
        <>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className={`btn btn-sm ${showBreakdown ? 'btn-primary' : 'btn-ghost'}`}
            title={t('measureComparison.toggleBreakdown')}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">
              {showBreakdown ? t('measureComparison.hideBreakdown') : t('measureComparison.showBreakdown')}
            </span>
          </button>
          {measureScores.length > 0 && (
            <button
              onClick={handleExportChart}
              className="btn btn-ghost btn-sm"
              title={t('common.exportChart')}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </>
      }
    >
      <Bar ref={chartRef} data={chartData} options={options} />
    </BaseChart>
  )
}