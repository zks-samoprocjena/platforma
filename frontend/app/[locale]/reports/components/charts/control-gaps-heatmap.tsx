'use client'

import { useEffect, useRef } from 'react'
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
import { Download, Info, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface ControlGapsHeatmapProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface HeatmapData {
  assessment_id: string
  security_level: string
  compliance_matrix: {
    rows: string[]
    columns: string[]
    data: (number | null)[][]
  }
  control_heatmap: {
    controls: Array<{
      label: string
      documentation: number
      implementation: number
      gap: number
    }>
  }
  statistics: {
    min_score: number
    max_score: number
    avg_compliance: number
    total_controls: number
    controls_with_gaps: number
  }
}

export function ControlGapsHeatmap({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: ControlGapsHeatmapProps) {
  const t = useTranslations('Reports.charts')
  const chartRef = useRef<ChartJS<'bar'>>(null)

  // Fetch heatmap data
  const { data: heatmapData, isLoading, error } = useQuery({
    queryKey: ['assessment-heatmap-data', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<HeatmapData>(`/api/v1/assessments/${assessmentId}/heatmap-data`)
      return response
    },
    enabled: !!assessmentId
  })

  // Get all controls with gaps (no limit)
  const controlGaps = heatmapData?.control_heatmap.controls || []

  // Prepare chart data
  const chartData: ChartData<'bar'> = {
    labels: controlGaps.map(c => c.label),
    datasets: [
      {
        label: t('controlGapsHeatmap.documentation'),
        data: controlGaps.map(c => c.documentation || 0),
        backgroundColor: isIncomplete ? 'rgba(59, 130, 246, 0.3)' : '#3b82f6',
        borderColor: '#2563eb',
        borderWidth: isIncomplete ? 2 : 1,
      },
      {
        label: t('controlGapsHeatmap.implementation'),
        data: controlGaps.map(c => c.implementation || 0),
        backgroundColor: isIncomplete ? 'rgba(16, 185, 129, 0.3)' : '#10b981',
        borderColor: '#059669',
        borderWidth: isIncomplete ? 2 : 1,
      }
    ]
  }

  // Chart options
  const options: ChartOptions<'bar'> = {
    indexAxis: 'y', // Horizontal bars
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
          afterLabel: (context) => {
            const control = controlGaps[context.dataIndex]
            return control ? `Gap: ${control.gap.toFixed(1)}` : ''
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 5,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          stepSize: 1
        }
      },
      y: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
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
      link.download = 'control-gaps-heatmap.png'
      link.href = url
      link.click()
    }
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('controlGapsHeatmap.title')}
        description={t('controlGapsHeatmap.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('controlGapsHeatmap.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (!heatmapData) {
    return (
      <BaseChart
        title={t('controlGapsHeatmap.title')}
        description={t('controlGapsHeatmap.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('controlGapsHeatmap.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  // If no controls with gaps, show a message
  if (controlGaps.length === 0) {
    return (
      <BaseChart
        title={t('controlGapsHeatmap.title')}
        description={t('controlGapsHeatmap.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success/20 rounded-full mb-4">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">{t('controlGapsHeatmap.noGaps')}</h3>
          <p className="text-base-content/70">
            {t('controlGapsHeatmap.noGapsDescription')}
          </p>
          <div className="mt-6 stats stats-horizontal shadow">
            <div className="stat">
              <div className="stat-title">{t('controlGapsHeatmap.totalControls')}</div>
              <div className="stat-value text-2xl">{heatmapData.statistics.total_controls}</div>
            </div>
            <div className="stat">
              <div className="stat-title">{t('controlGapsHeatmap.avgCompliance')}</div>
              <div className="stat-value text-2xl text-success">{heatmapData.statistics.avg_compliance.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </BaseChart>
    )
  }

  const statistics = heatmapData.statistics

  return (
    <BaseChart
      title={t('controlGapsHeatmap.title')}
      description={t('controlGapsHeatmap.description')}
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
          <div className="tooltip tooltip-left" data-tip={t('controlGapsHeatmap.help')}>
            <button className="btn btn-ghost btn-sm btn-circle">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </>
      }
    >
      {/* Statistics Summary */}
      <div className="bg-base-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <h4 className="font-semibold">{t('controlGapsHeatmap.gapAnalysis')}</h4>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-base-content/70">{t('controlGapsHeatmap.totalControls')}:</span>
            <span className="ml-2 font-medium">{statistics.total_controls}</span>
          </div>
          <div>
            <span className="text-base-content/70">{t('controlGapsHeatmap.controlsWithGaps')}:</span>
            <span className="ml-2 font-medium text-warning">{statistics.controls_with_gaps}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {/* Dynamic height based on number of controls, with min and max */}
        <div style={{ 
          height: `${Math.max(400, Math.min(800, controlGaps.length * 30 + 100))}px`,
          maxHeight: '800px',
          overflowY: controlGaps.length > 20 ? 'auto' : 'visible',
          overflowX: 'hidden'
        }}>
          <Bar ref={chartRef} data={chartData} options={options} />
        </div>
      </div>

      {/* Note about gaps */}
      <div className="mt-4 text-sm text-base-content/70 text-center">
        {controlGaps.length === 1 
          ? t('controlGapsHeatmap.showingOne')
          : t('controlGapsHeatmap.showingAll', { count: controlGaps.length })}
      </div>
    </BaseChart>
  )
}