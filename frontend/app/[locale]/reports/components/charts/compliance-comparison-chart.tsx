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
import { Assessment } from '@/types/assessment'
import { Download } from 'lucide-react'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface ComplianceComparisonChartProps {
  assessments: Assessment[]
  loading?: boolean
  error?: Error | null
}

export function ComplianceComparisonChart({ 
  assessments, 
  loading, 
  error 
}: ComplianceComparisonChartProps) {
  const t = useTranslations('Reports.charts')
  const chartRef = useRef<ChartJS<'bar'>>(null)

  // Filter only completed assessments with compliance data
  const completedAssessments = assessments.filter(
    a => a.status === 'completed' && a.compliance_percentage !== null && a.compliance_percentage !== undefined
  )

  // Prepare chart data
  const chartData: ChartData<'bar'> = {
    labels: completedAssessments.map(a => {
      const date = new Date(a.completed_at || a.updated_at)
      return `${a.title} (${date.toLocaleDateString('hr-HR', { month: 'short', year: 'numeric' })})`
    }),
    datasets: [
      {
        label: t('complianceComparison.overallCompliance'),
        data: completedAssessments.map(a => a.compliance_percentage || 0),
        backgroundColor: completedAssessments.map(a => {
          const score = a.compliance_percentage || 0
          if (score >= 90) return '#10b981' // green-500
          if (score >= 75) return '#3b82f6' // blue-500
          if (score >= 60) return '#f59e0b' // amber-500
          return '#ef4444' // red-500
        }),
        borderColor: completedAssessments.map(a => {
          const score = a.compliance_percentage || 0
          if (score >= 90) return '#059669' // green-600
          if (score >= 75) return '#2563eb' // blue-600
          if (score >= 60) return '#d97706' // amber-600
          return '#dc2626' // red-600
        }),
        borderWidth: 1,
        borderRadius: 4,
      }
    ]
  }

  // Chart options
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
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
        displayColors: false,
        callbacks: {
          label: (context) => {
            const assessment = completedAssessments[context.dataIndex]
            if (!assessment) {
              return `${t('complianceComparison.compliance')}: ${context.parsed.y.toFixed(1)}%`
            }
            return [
              `${t('complianceComparison.compliance')}: ${context.parsed.y.toFixed(1)}%`,
              `${t('complianceComparison.securityLevel')}: ${t(`common.securityLevel.${assessment.security_level}`)}`
            ]
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
          minRotation: 45
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
      link.download = 'compliance-comparison.png'
      link.href = url
      link.click()
    }
  }

  if (completedAssessments.length === 0 && !loading) {
    return (
      <BaseChart
        title={t('complianceComparison.title')}
        description={t('complianceComparison.description')}
        loading={loading}
        error={error}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('complianceComparison.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('complianceComparison.title')}
      description={t('complianceComparison.description')}
      loading={loading}
      error={error}
      actions={
        completedAssessments.length > 0 && (
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
      <Bar ref={chartRef} data={chartData} options={options} />
    </BaseChart>
  )
}