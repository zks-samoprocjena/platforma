'use client'

import { useTranslations } from 'next-intl'
import { Calendar, AlertTriangle, Clock } from 'lucide-react'
import { AssessmentStatus } from '@/types/assessment'

interface DeadlineBadgeProps {
  dueDate: string | null | undefined
  status: AssessmentStatus
  size?: 'sm' | 'md'
  showIcon?: boolean
}

type DeadlineStatus = 'overdue' | 'urgent' | 'upcoming' | 'comfortable' | null

interface DeadlineInfo {
  status: DeadlineStatus
  days: number
  isToday: boolean
}

function calculateDeadlineStatus(dueDate: string | null | undefined): DeadlineInfo | null {
  if (!dueDate) return null
  
  const now = new Date()
  now.setHours(0, 0, 0, 0) // Reset to start of day
  
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0) // Reset to start of day
  
  const diffTime = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24))
  
  const isToday = diffDays === 0
  
  if (diffDays < 0) return { status: 'overdue', days: Math.abs(diffDays), isToday }
  if (diffDays === 0) return { status: 'urgent', days: 0, isToday }
  if (diffDays <= 3) return { status: 'urgent', days: diffDays, isToday }
  if (diffDays <= 7) return { status: 'upcoming', days: diffDays, isToday }
  return { status: 'comfortable', days: diffDays, isToday }
}

export function DeadlineBadge({ 
  dueDate, 
  status, 
  size = 'sm',
  showIcon = true 
}: DeadlineBadgeProps) {
  const t = useTranslations('Assessment')
  
  // Don't show deadline for completed or archived assessments
  if (status === 'completed' || status === 'archived') {
    return null
  }
  
  const deadlineInfo = calculateDeadlineStatus(dueDate)
  
  if (!deadlineInfo) {
    return null
  }
  
  const getStatusClasses = () => {
    switch (deadlineInfo.status) {
      case 'overdue':
        return 'badge-error'
      case 'urgent':
        return 'badge-warning'
      case 'upcoming':
        return 'badge-info'
      case 'comfortable':
        return 'badge-success'
      default:
        return 'badge-ghost'
    }
  }
  
  const getIcon = () => {
    switch (deadlineInfo.status) {
      case 'overdue':
        return <AlertTriangle className="h-3 w-3" />
      case 'urgent':
        return <Clock className="h-3 w-3" />
      default:
        return <Calendar className="h-3 w-3" />
    }
  }
  
  const getLabel = () => {
    if (deadlineInfo.isToday) {
      return t('deadline.today')
    }
    
    if (deadlineInfo.status === 'overdue') {
      return t('deadline.overdue', { days: deadlineInfo.days })
    }
    
    return t('deadline.remaining', { days: deadlineInfo.days })
  }
  
  const sizeClasses = size === 'sm' ? 'badge-sm text-xs' : 'badge-md text-sm'
  
  return (
    <div className={`badge ${getStatusClasses()} ${sizeClasses} gap-1`}>
      {showIcon && getIcon()}
      <span className="font-medium">{getLabel()}</span>
    </div>
  )
}