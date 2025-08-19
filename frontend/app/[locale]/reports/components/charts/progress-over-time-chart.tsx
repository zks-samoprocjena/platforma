'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { BaseChart } from './base-chart'
import { Assessment } from '@/types/assessment'
import { Download } from 'lucide-react'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface ProgressOverTimeChartProps {
  assessments: Assessment[]
  loading?: boolean
  error?: Error | null
}

interface TimePoint {
  date: Date
  overall: number
  mandatory: number
  voluntary: number
  assessmentTitle: string
}

export function ProgressOverTimeChart({ 
  assessments, 
  loading, 
  error 
}: ProgressOverTimeChartProps) {
  const t = useTranslations('Reports.charts')
  const chartRef = useRef<ChartJS<'line'>>(null)

  // Process assessments to create time series data
  const timePoints: TimePoint[] = assessments
    .filter(a => a.status === 'completed' || a.status === 'in_progress')
    .map(a => {
      const progress = a.progress || {
        completion_percentage: 0,
        mandatory_completion_percentage: 0,
        total_controls: 0,
        mandatory_controls: 0
      }
      
      // Calculate voluntary completion (total - mandatory)
      const voluntaryCompletion = progress.completion_percentage > 0 && progress.total_controls > 0
        ? ((progress.total_controls - progress.mandatory_controls) / progress.total_controls) * 100
        : 0

      return {
        date: new Date(a.updated_at),
        overall: progress.completion_percentage || 0,
        mandatory: progress.mandatory_completion_percentage || 0,
        voluntary: voluntaryCompletion,
        assessmentTitle: a.title
      }
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  // Prepare chart data
  const chartData: ChartData<'line'> = {
    labels: timePoints.map(tp => 
      tp.date.toLocaleDateString('hr-HR', { 
        day: 'numeric',
        month: 'short',
        year: '2-digit'
      })
    ),
    datasets: [
      {
        label: t('progressOverTime.overall'),
        data: timePoints.map(tp => tp.overall),
        borderColor: '#3b82f6', // blue-500
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: t('progressOverTime.mandatory'),
        data: timePoints.map(tp => tp.mandatory),
        borderColor: '#10b981', // green-500
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: t('progressOverTime.voluntary'),
        data: timePoints.map(tp => tp.voluntary),
        borderColor: '#f59e0b', // amber-500
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        borderDash: [5, 5],
        pointRadius: 4,
        pointHoverRadius: 6,
      }
    ]
  }

  // Chart options
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
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
          title: (items) => {
            const point = timePoints[items[0]?.dataIndex]
            return point?.assessmentTitle || ''
          },
          label: (context) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`
          },
          afterBody: (items) => {
            const point = timePoints[items[0]?.dataIndex]
            return point ? `\n${t('progressOverTime.date')}: ${point.date.toLocaleDateString('hr-HR')}` : ''
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          callback: (value) => `${value}%`,
          stepSize: 20
        }
      }
    }
  }

  const handleExportChart = () => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'progress-over-time.png'
      link.href = url
      link.click()
    }
  }

  if (timePoints.length === 0 && !loading) {
    return (
      <BaseChart
        title={t('progressOverTime.title')}
        description={t('progressOverTime.description')}
        loading={loading}
        error={error}
        height={320}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('progressOverTime.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('progressOverTime.title')}
      description={t('progressOverTime.description')}
      loading={loading}
      error={error}
      height={320}
      actions={
        timePoints.length > 0 && (
          <button
            onClick={handleExportChart}
            className="btn btn-ghost btn-sm"
            title={t('common.exportChart')}
          >
            <Download className="h-4 w-4" />
          </button>
        )
      }
    >
      <Line ref={chartRef} data={chartData} options={options} />
    </BaseChart>
  )
}