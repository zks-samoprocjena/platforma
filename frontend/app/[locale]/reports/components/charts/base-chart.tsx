'use client'

import { ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

interface BaseChartProps {
  title: string
  description?: string
  height?: number
  loading?: boolean
  error?: Error | null
  children: ReactNode
  actions?: ReactNode
}

export function BaseChart({
  title,
  description,
  height = 400,
  loading,
  error,
  children,
  actions
}: BaseChartProps) {
  if (loading) {
    return (
      <div className="assessment-card p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-base-300 rounded w-1/3 mb-2"></div>
          {description && <div className="h-4 bg-base-300 rounded w-2/3 mb-4"></div>}
          <div className="bg-base-300 rounded" style={{ height: `${height}px` }}></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="assessment-card p-6">
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-error mx-auto mb-4" />
          <p className="text-base-content/70 mb-4">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="assessment-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {title}
            {description && (
              <div className="tooltip tooltip-right" data-tip={description}>
                <Info className="h-4 w-4 text-base-content/50" />
              </div>
            )}
          </h3>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div style={{ height: `${height}px`, position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}