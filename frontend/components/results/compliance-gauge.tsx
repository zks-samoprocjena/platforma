'use client'

import { useTranslations } from 'next-intl'

interface ComplianceGaugeProps {
  percentage: number
  size?: 'small' | 'medium' | 'large'
  showLabel?: boolean
}

export default function ComplianceGauge({ 
  percentage, 
  size = 'medium', 
  showLabel = true 
}: ComplianceGaugeProps) {
  const t = useTranslations('results.overview')

  const getComplianceLevel = (percentage: number) => {
    if (percentage >= 90) return { level: 'excellent', color: '#10b981', label: t('complianceLevel.excellent') }
    if (percentage >= 75) return { level: 'good', color: '#3b82f6', label: t('complianceLevel.good') }
    if (percentage >= 60) return { level: 'moderate', color: '#f59e0b', label: t('complianceLevel.moderate') }
    return { level: 'needsImprovement', color: '#ef4444', label: t('complianceLevel.needsImprovement') }
  }

  const compliance = getComplianceLevel(percentage)
  
  const getSizeClasses = () => {
    switch (size) {
      case 'small': return { container: 'w-24 h-24', text: 'text-sm', label: 'text-xs' }
      case 'large': return { container: 'w-48 h-48', text: 'text-2xl', label: 'text-sm' }
      default: return { container: 'w-32 h-32', text: 'text-lg', label: 'text-sm' }
    }
  }

  const sizeClasses = getSizeClasses()
  
  // Calculate the stroke-dasharray for the circle
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${sizeClasses.container}`}>
        <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-base-300"
          />
          
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={compliance.color}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-in-out"
          />
        </svg>
        
        {/* Percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`font-bold ${sizeClasses.text}`} style={{ color: compliance.color }}>
              {percentage.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
      
      {showLabel && (
        <div className={`mt-2 text-center ${sizeClasses.label} text-base-content/70`}>
          {compliance.label}
        </div>
      )}
    </div>
  )
}