'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { BaseChart } from './base-chart'
import { Download, Info } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface ComplianceMatrixProps {
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

export function ComplianceMatrix({ 
  assessmentId, 
  loading: parentLoading, 
  error: parentError,
  isIncomplete = false
}: ComplianceMatrixProps) {
  const t = useTranslations('Reports.charts')
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Draw heatmap on canvas
  useEffect(() => {
    if (!canvasRef.current || !heatmapData?.compliance_matrix) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const matrix = heatmapData.compliance_matrix
    const cellWidth = 40
    const cellHeight = 30
    const labelWidth = 60
    const labelHeight = 40

    // Set canvas size
    canvas.width = labelWidth + (matrix.columns.length * cellWidth) + 20
    canvas.height = labelHeight + (matrix.rows.length * cellHeight) + 20

    // Clear canvas
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Set font
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Draw column labels
    ctx.fillStyle = '#333'
    matrix.columns.forEach((col, i) => {
      ctx.save()
      ctx.translate(labelWidth + (i * cellWidth) + cellWidth/2, labelHeight/2)
      ctx.rotate(-Math.PI/4)
      ctx.fillText(col, 0, 0)
      ctx.restore()
    })

    // Draw row labels
    matrix.rows.forEach((row, i) => {
      ctx.fillStyle = '#333'
      ctx.textAlign = 'right'
      ctx.fillText(row, labelWidth - 10, labelHeight + (i * cellHeight) + cellHeight/2)
    })

    // Draw cells
    matrix.data.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const x = labelWidth + (colIndex * cellWidth)
        const y = labelHeight + (rowIndex * cellHeight)

        // Determine color based on value
        let color = '#f3f4f6' // gray-100
        if (value !== null && value !== undefined) {
          if (value >= 90) color = '#10b981' // green-500
          else if (value >= 75) color = '#3b82f6' // blue-500
          else if (value >= 60) color = '#f59e0b' // amber-500
          else if (value >= 40) color = '#fb923c' // orange-400
          else color = '#ef4444' // red-500
        }

        // Apply opacity for incomplete data
        if (isIncomplete) {
          ctx.globalAlpha = 0.6
        }

        // Draw cell
        ctx.fillStyle = color
        ctx.fillRect(x, y, cellWidth - 2, cellHeight - 2)

        // Draw value text
        if (value !== null && value !== undefined) {
          ctx.globalAlpha = 1
          ctx.fillStyle = value < 50 ? 'white' : 'black'
          ctx.textAlign = 'center'
          ctx.font = '10px Arial'
          ctx.fillText(Math.round(value).toString(), x + cellWidth/2, y + cellHeight/2)
        }

        ctx.globalAlpha = 1
      })
    })

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb' // gray-200
    ctx.lineWidth = 1

    // Vertical lines
    for (let i = 0; i <= matrix.columns.length; i++) {
      ctx.beginPath()
      ctx.moveTo(labelWidth + (i * cellWidth), labelHeight)
      ctx.lineTo(labelWidth + (i * cellWidth), canvas.height)
      ctx.stroke()
    }

    // Horizontal lines
    for (let i = 0; i <= matrix.rows.length; i++) {
      ctx.beginPath()
      ctx.moveTo(labelWidth, labelHeight + (i * cellHeight))
      ctx.lineTo(canvas.width, labelHeight + (i * cellHeight))
      ctx.stroke()
    }

  }, [heatmapData, isIncomplete])

  const handleExportChart = () => {
    if (!canvasRef.current) return
    
    const url = canvasRef.current.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = 'compliance-matrix.png'
    link.href = url
    link.click()
  }

  const isLoadingData = parentLoading || isLoading
  const errorData = parentError || error

  if (!assessmentId && !isLoadingData) {
    return (
      <BaseChart
        title={t('complianceMatrix.title')}
        description={t('complianceMatrix.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('complianceMatrix.selectAssessment')}
          </p>
        </div>
      </BaseChart>
    )
  }

  if (!heatmapData || !heatmapData.compliance_matrix.data.length) {
    return (
      <BaseChart
        title={t('complianceMatrix.title')}
        description={t('complianceMatrix.description')}
        loading={isLoadingData}
        error={errorData}
      >
        <div className="flex items-center justify-center h-full">
          <p className="text-base-content/50">
            {t('complianceMatrix.noData')}
          </p>
        </div>
      </BaseChart>
    )
  }

  return (
    <BaseChart
      title={t('complianceMatrix.title')}
      description={t('complianceMatrix.description')}
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
          <div className="tooltip tooltip-left" data-tip={t('complianceMatrix.help')}>
            <button className="btn btn-ghost btn-sm btn-circle">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </>
      }
    >
      <div className="overflow-auto">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>
      
      {/* Color Legend */}
      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>≥90%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>75-89%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-amber-500 rounded"></div>
          <span>60-74%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-orange-400 rounded"></div>
          <span>40-59%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span>&lt;40%</span>
        </div>
      </div>
    </BaseChart>
  )
}