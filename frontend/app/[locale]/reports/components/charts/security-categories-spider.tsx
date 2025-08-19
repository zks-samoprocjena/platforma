'use client'

import { useRef, useState } from 'react'
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
import { Download, Info, Shield } from 'lucide-react'
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

interface SecurityCategoriesSpiderProps {
  assessmentId?: string
  loading?: boolean
  error?: Error | null
  isIncomplete?: boolean
}

interface SecurityCategoriesData {
  assessment_id: string
  security_level: string
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    borderColor?: string
    backgroundColor?: string
  }>
}

export function SecurityCategoriesSpider({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: SecurityCategoriesSpiderProps) {
  const t = useTranslations('Reports.charts')
  const locale = useLocale()
  const chartRef = useRef<ChartJS<'radar'>>(null)
  const [showWeakAreas, setShowWeakAreas] = useState(false)

  // Fetch security categories spider data
  const { data: spiderData, isLoading, error } = useQuery({
    queryKey: ['assessment-categories-spider', assessmentId, locale],
    queryFn: async () => {
      if (!assessmentId) return null
      const response = await apiClient.get<SecurityCategoriesData>(
        `/api/v1/assessments/${assessmentId}/security-categories-spider?locale=${locale}`
      )
      return response
    },
    enabled: !!assessmentId
  })

  // Prepare chart data
  const chartData: ChartData<'radar'> = {
    labels: spiderData?.labels || [],
    datasets: spiderData?.datasets.map((dataset, index) => ({
      ...dataset,
      borderWidth: 2,
      borderDash: isIncomplete && index < 2 ? [5, 5] : [], // Dashed for doc/impl if incomplete
      pointBackgroundColor: dataset.borderColor,
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: dataset.borderColor,
      pointRadius: 4,
      pointHoverRadius: 6
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
          title: (context) => {
            return context[0].label || ''
          },
          label: (context) => {
            const value = context.parsed.r
            const label = context.dataset.label
            
            if (label === 'Mandatory Compliance') {
              const percentage = (value / 5) * 100
              return `${label}: ${percentage.toFixed(0)}% compliant`
            }
            
            return `${label}: ${value.toFixed(2)}/5.0`
          },
          afterBody: (context) => {
            // Find the category with lowest scores
            const categoryIndex = context[0].dataIndex
            const docScore = chartData.datasets[0]?.data?.[categoryIndex] as number || 0
            const implScore = chartData.datasets[1]?.data?.[categoryIndex] as number || 0
            const gap = Math.abs(docScore - implScore)
            
            if (gap >= 1.5) {
              return `\n⚠️ Significant gap between documentation and implementation (${gap.toFixed(1)} points)`
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
            const labels: Record<number, string> = {
              0: '0',
              1: 'Poor',
              2: 'Basic',
              3: 'Good',
              4: 'Strong',
              5: 'Excellent'
            }
            return labels[value as number] || value.toString()
          }
        },
        pointLabels: {
          font: {
            size: 11
          },
          callback: (label) => {
            // Wrap long labels
            if (typeof label === 'string' && label.includes('&')) {
              const parts = label.split('&')
              return parts.map(p => p.trim())
            }
            return label
          }
        },
        grid: {
          color: (context) => {
            // Highlight the "Good" threshold
            if (context.tick.value === 3) {
              return 'rgba(34, 197, 94, 0.2)'
            }
            return 'rgba(0, 0, 0, 0.1)'
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
      link.download = 'security-categories-spider.png'
      link.href = url
      link.click()
    }
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  // Calculate average scores for summary
  const calculateAverageScore = (datasetIndex: number) => {
    if (!spiderData || !spiderData.datasets[datasetIndex]) return 0
    const scores = spiderData.datasets[datasetIndex].data
    if (scores.length === 0) return 0
    return scores.reduce((sum, score) => sum + score, 0) / scores.length
  }

  // Identify weakest categories
  const identifyWeakCategories = () => {
    if (!spiderData || spiderData.labels.length === 0) return []
    
    const categories = spiderData.labels.map((label, index) => {
      const docScore = spiderData.datasets[0]?.data[index] || 0
      const implScore = spiderData.datasets[1]?.data[index] || 0
      const avgScore = (docScore + implScore) / 2
      return { label, avgScore }
    })
    
    return categories
      .filter(cat => cat.avgScore < 3)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 3)
  }

  const weakCategories = identifyWeakCategories()

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('securityCategories.title')}
        description={t('securityCategories.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('securityCategories.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (!spiderData || spiderData.labels.length === 0) {
    return (
      <BaseChart
        title={t('securityCategories.title')}
        description={t('securityCategories.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('securityCategories.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('securityCategories.title')}
      description={t('securityCategories.description')}
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
          <div className="tooltip tooltip-left" data-tip={t('securityCategories.help')}>
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
      
      {/* Summary statistics */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="stat p-2">
          <div className="stat-title text-xs">{t('securityCategories.avgDocumentation')}</div>
          <div className="stat-value text-lg">{calculateAverageScore(0).toFixed(1)}/5</div>
        </div>
        <div className="stat p-2">
          <div className="stat-title text-xs">{t('securityCategories.avgImplementation')}</div>
          <div className="stat-value text-lg">{calculateAverageScore(1).toFixed(1)}/5</div>
        </div>
        <div className="stat p-2">
          <div className="stat-title text-xs">{t('securityCategories.avgCompliance')}</div>
          <div className="stat-value text-lg">
            {((calculateAverageScore(2) / 5) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Weak areas indicator with expandable details */}
      {weakCategories.length > 0 && (
        <div className="mt-4 relative">
          <button
            onClick={() => setShowWeakAreas(!showWeakAreas)}
            className="btn btn-warning btn-sm gap-2 w-full justify-start"
          >
            <Shield className="h-4 w-4" />
            <span className="flex-1 text-left">
              {t('securityCategories.weakAreas')} ({weakCategories.length})
            </span>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-4 w-4 transition-transform ${showWeakAreas ? 'rotate-180' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showWeakAreas && (
            <div className="absolute z-50 mt-2 w-full p-4 bg-base-100 rounded-lg shadow-xl border border-warning">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-sm">{t('securityCategories.weakAreas')}</h4>
                <button 
                  onClick={() => setShowWeakAreas(false)}
                  className="btn btn-ghost btn-xs btn-circle"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ul className="text-sm space-y-2">
                {weakCategories.map(cat => (
                  <li key={cat.label} className="flex justify-between p-2 bg-base-200 rounded">
                    <span>{cat.label}</span>
                    <span className="font-mono font-semibold text-warning">{cat.avgScore.toFixed(1)}/5.0</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </BaseChart>
  )
}