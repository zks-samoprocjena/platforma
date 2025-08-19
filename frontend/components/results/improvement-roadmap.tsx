'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { MapIcon, CalendarIcon, ClockIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
// import { useAIRoadmap } from '@/hooks/api/use-ai'
import { AssessmentResultsResponse } from '@/types/assessment'

interface ImprovementRoadmapProps {
  assessmentId: string
  organizationId: string
  results: AssessmentResultsResponse
  language: 'hr' | 'en'
  insights?: import('@/types/assessment').AssessmentInsights
}

interface LocalRoadmapPhase {
  title: string
  timeframe: string
  priority: 'high' | 'medium' | 'low'
  items: RoadmapItem[]
  description: string
}

interface RoadmapItem {
  id: string
  title: string
  description: string
  effort_estimate: 'high' | 'medium' | 'low'
  compliance_impact: number
  timeline_weeks: number
  dependencies?: string[]
  completed: boolean
}

export default function ImprovementRoadmap({
  assessmentId,
  organizationId,
  results,
  language,
  insights
}: ImprovementRoadmapProps) {
  const t = useTranslations('results.roadmap')
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
  const [selectedPhase, setSelectedPhase] = useState<number>(0)
  
  // Use persisted roadmap if available; no async hook needed
  const roadmapData = insights?.roadmap as any
  const isLoading = false
  const error = null

  const normalizeInsightsRoadmap = (data: any): LocalRoadmapPhase[] => {
    const phases = Array.isArray(data?.phases) ? data.phases : []
    return phases.map((phase: any, phaseIndex: number) => {
      const items = Array.isArray(phase?.items) ? phase.items : []
      const phaseName: string = String(phase?.name ?? phase?.title ?? '').toLowerCase()
      const fallbackPriority: 'high' | 'medium' | 'low' = phaseName.includes('short')
        ? 'high'
        : phaseName.includes('medium')
        ? 'medium'
        : 'low'
      const effortForPriority = (p: string): 'high' | 'medium' | 'low' => {
        if (p === 'critical' || p === 'high') return 'high'
        if (p === 'medium') return 'medium'
        return 'low'
      }
      const weeksForPriority = (p: string): number => {
        if (p === 'critical') return 4
        if (p === 'high') return 6
        if (p === 'medium') return 8
        return 12
      }
      const impactForPriority = (p: string): number => {
        if (p === 'critical' || p === 'high') return 12
        if (p === 'medium') return 8
        return 4
      }
      const normalizedItemsRaw: RoadmapItem[] = items.map((item: any, itemIndex: number) => {
        const id = String(item?.id ?? item?.control_id ?? item?.control_code ?? `item-${phaseIndex}-${itemIndex}`)
        const title = String(item?.title ?? item?.control_name ?? item?.control_title ?? 'Item')
        const priority = String(item?.priority ?? fallbackPriority)
        return {
          id,
          title,
          description: String(
            item?.description ?? item?.recommendation ??
            (language === 'hr' ? `Fokus: ${title}` : `Focus: ${title}`)
          ),
          effort_estimate: (item?.effort_estimate ?? effortForPriority(priority)) as 'high' | 'medium' | 'low',
          compliance_impact: Number.isFinite(Number(item?.compliance_impact)) ? Number(item.compliance_impact) : impactForPriority(priority),
          timeline_weeks: Number.isFinite(Number(item?.timeline_weeks)) ? Number(item.timeline_weeks) : weeksForPriority(priority),
          dependencies: Array.isArray(item?.dependencies) ? item.dependencies : [],
          completed: Boolean(item?.completed ?? false)
        }
      })
      const uniqueMap = new Map<string, RoadmapItem>()
      for (const it of normalizedItemsRaw) {
        if (!uniqueMap.has(it.id)) uniqueMap.set(it.id, it)
      }
      const normalizedItems = Array.from(uniqueMap.values())
      return {
        title: String(phase?.title ?? phase?.name ?? (language === 'hr' ? 'Faza' : 'Phase')),
        timeframe: String(phase?.timeframe ?? phase?.duration ?? ''),
        priority: (phase?.priority ?? fallbackPriority) as 'high' | 'medium' | 'low',
        description: String(phase?.description ?? ''),
        items: normalizedItems
      }
    })
  }

  // Load completed items from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`roadmap-completed-${assessmentId}`)
    if (saved) {
      setCompletedItems(new Set(JSON.parse(saved)))
    }
  }, [assessmentId])

  // Save completed items to localStorage
  const toggleItemCompletion = (itemId: string) => {
    const newCompleted = new Set(completedItems)
    if (newCompleted.has(itemId)) {
      newCompleted.delete(itemId)
    } else {
      newCompleted.add(itemId)
    }
    setCompletedItems(newCompleted)
    localStorage.setItem(`roadmap-completed-${assessmentId}`, JSON.stringify(Array.from(newCompleted)))
  }

  

  // Use insights roadmap when available, normalized; otherwise mock data
  const roadmapPhases: LocalRoadmapPhase[] = Array.isArray(roadmapData?.phases)
    ? normalizeInsightsRoadmap(roadmapData)
    : []

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'high': return 'text-red-600'
      case 'medium': return 'text-yellow-600'
      case 'low': return 'text-green-600'
      default: return 'text-gray-600'
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4 w-1/3"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{t('error')}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  if (!roadmapPhases.length) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <MapIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            {t('title')}
          </h2>
        </div>
        <p className="text-gray-600">{t('noData')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <MapIcon className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">
          {t('title')}
        </h2>
      </div>

      {/* Overview Statistics */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900">{t('stats.totalItems')}</h4>
          <p className="text-2xl font-bold text-blue-700">
            {roadmapPhases.reduce((acc, phase) => acc + phase.items.length, 0)}
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium text-green-900">{t('stats.completed')}</h4>
          <p className="text-2xl font-bold text-green-700">
            {completedItems.size}
          </p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-medium text-yellow-900">{t('stats.impact')}</h4>
          <p className="text-2xl font-bold text-yellow-700">
            {roadmapPhases.reduce((acc, phase) => 
              acc + phase.items.reduce((sum, item) => sum + item.compliance_impact, 0), 0
            )}%
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <h4 className="font-medium text-purple-900">{t('stats.timeline')}</h4>
          <p className="text-2xl font-bold text-purple-700">
            {(() => {
              const weeks = roadmapPhases.flatMap(p => Array.isArray(p.items) ? p.items.map(i => i.timeline_weeks ?? 0) : [])
              return weeks.length ? Math.max(...weeks) : 0
            })()} {t('stats.weeks')}
          </p>
        </div>
      </div>

      {/* Phase Navigation */}
      <div className="flex space-x-2 mb-6 overflow-x-auto">
        {roadmapPhases.map((phase, index) => (
          <button
            key={index}
            onClick={() => setSelectedPhase(index)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedPhase === index
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              <span className="font-medium">{String(phase.title ?? '').split('(')[0].trim() || phase.title || ''}</span>
            </div>
            <div className="text-sm opacity-75">{phase.timeframe}</div>
          </button>
        ))}
      </div>

      {/* Selected Phase Details */}
      {roadmapPhases[selectedPhase] && (
        <div className="space-y-6">
          <div className="border-l-4 border-blue-500 pl-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {roadmapPhases[selectedPhase].title}
            </h3>
            <p className="text-gray-600 mb-3">
              {roadmapPhases[selectedPhase].description}
            </p>
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${
                getPriorityColor(roadmapPhases[selectedPhase].priority)
              }`}>
                {t(`priority.${roadmapPhases[selectedPhase].priority}`)}
              </span>
              <span className="text-sm text-gray-600 flex items-center gap-1">
                <ClockIcon className="w-4 h-4" />
                {roadmapPhases[selectedPhase].timeframe}
              </span>
            </div>
          </div>

          {/* Roadmap Items */}
          <div className="space-y-4">
            {roadmapPhases[selectedPhase].items.map((item, itemIndex) => (
              <div
                key={`${selectedPhase}-${item.id}-${itemIndex}`}
                className={`border rounded-lg p-4 transition-all ${
                  completedItems.has(item.id)
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleItemCompletion(item.id)}
                    className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      completedItems.has(item.id)
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-gray-300 hover:border-blue-500'
                    }`}
                  >
                    {completedItems.has(item.id) && (
                      <CheckCircleIcon className="w-3 h-3" />
                    )}
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className={`font-medium ${
                        completedItems.has(item.id) ? 'text-green-800 line-through' : 'text-gray-900'
                      }`}>
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-medium ${getEffortColor(item.effort_estimate)}`}>
                          {t(`effort.${item.effort_estimate}`)}
                        </span>
                        <span className="text-blue-600 font-medium">
                          +{item.compliance_impact}%
                        </span>
                      </div>
                    </div>
                    
                    <p className={`text-sm mb-3 ${
                      completedItems.has(item.id) ? 'text-green-700' : 'text-gray-600'
                    }`}>
                      {item.description}
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {item.timeline_weeks} {t('weeks')}
                        </span>
                      </div>
                      
                      {item.dependencies && item.dependencies.length > 0 && (
                        <div className="text-gray-500">
                          {t('dependencies')}: {item.dependencies.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
          {t('exportRoadmap')}
        </button>
        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">
          {t('scheduleReview')}
        </button>
      </div>
    </div>
  )
}
