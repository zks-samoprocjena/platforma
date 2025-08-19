import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { apiRequest } from '@/lib/api-client'
import { aiKeys } from '@/lib/query-keys'
import type { AIRecommendation } from '@/types/assessment'

interface ProgressiveRecommendationsState {
  recommendations: AIRecommendation[]
  isLoading: boolean
  isPolling: boolean
  error: Error | null
  metadata: {
    batch_id?: string
    background_job_id?: string
    progressive_mode?: boolean
    total_available: number
    remaining_gaps: number
  } | null
}

export function useProgressiveRecommendations(
  assessmentId: string,
  organizationId: string,
  enabled: boolean = true
) {
  const queryClient = useQueryClient()
  const [pollingInterval, setPollingInterval] = useState<number | null>(null)
  const [accumulatedRecommendations, setAccumulatedRecommendations] = useState<AIRecommendation[]>([])
  const [batchId, setBatchId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  // Initial request for first recommendation
  const { data: initialData, isLoading, error, refetch } = useQuery({
    queryKey: [...aiKeys.recommendations(assessmentId, organizationId), 'progressive'],
    queryFn: async () => {
      console.log('[useProgressiveRecommendations] Fetching initial recommendation')
      
      const response = await apiRequest<{
        recommendations: any[]
        metadata: {
          batch_id?: string
          background_job_id?: string
          progressive_mode?: boolean
          total_available: number
          remaining_gaps: number
        }
        summary: string
        total_gaps: number
      }>('POST', '/api/v1/ai/recommendations', {
        assessment_id: assessmentId,
        organization_id: organizationId,
        offset: 0,
        max_recommendations: 5, // Request 5, but will get 1 immediately if progressive
        exclude_control_ids: []
      })
      
      // Transform recommendations
      const recommendations = (response.recommendations || []).map((rec: any, index: number) => ({
        id: rec.id || `recommendation-${index}`,
        title: rec.title || rec.control_name || `Improvement for Control ${rec.control_id}`,
        description: rec.description || rec.recommendation || 'AI-generated recommendation',
        priority: rec.priority || 'medium',
        effort_estimate: rec.effort_estimate || 'medium',
        timeline_weeks: rec.timeline_weeks || rec.estimated_weeks || 4,
        compliance_impact: rec.compliance_impact || rec.target_score || 0,
        implementation_steps: rec.implementation_steps || [],
        source_references: rec.source_references || rec.sources?.map((s: any) => s.source) || [],
        category: rec.category || 'implementation',
        control_ids: rec.control_ids || (rec.control_id ? [rec.control_id] : [])
      }))
      
      return {
        recommendations,
        metadata: response.metadata,
        summary: response.summary,
        total_gaps: response.total_gaps
      }
    },
    enabled: enabled && !!assessmentId && !!organizationId,
    staleTime: 0,
    gcTime: 5 * 60 * 1000
  })

  // Poll for additional recommendations
  const pollForRecommendations = useCallback(async () => {
    if (!batchId || !isPolling) return
    
    try {
      console.log('[useProgressiveRecommendations] Polling for batch:', batchId)
      
      const response = await apiRequest<{
        batch_id: string
        recommendations: any[]
        count: number
        status: string
      }>('GET', `/api/v1/ai/recommendations/batch/${batchId}`)
      
      if (response.recommendations && response.recommendations.length > 0) {
        // Transform and add new recommendations
        const newRecommendations = response.recommendations.map((rec: any) => ({
          id: rec.id,
          title: rec.title,
          description: rec.description,
          priority: rec.priority,
          effort_estimate: rec.effort_estimate,
          timeline_weeks: 4,
          compliance_impact: rec.target_score || 0,
          implementation_steps: [],
          source_references: [],
          category: 'implementation',
          control_ids: rec.control_id ? [rec.control_id] : []
        }))
        
        // Add to accumulated recommendations (avoiding duplicates)
        setAccumulatedRecommendations(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const uniqueNew = newRecommendations.filter(r => !existingIds.has(r.id))
          return [...prev, ...uniqueNew]
        })
        
        // If we've received all recommendations, stop polling
        if (response.status === 'completed' || response.count >= 4) {
          console.log('[useProgressiveRecommendations] All recommendations received, stopping polling')
          setIsPolling(false)
          setPollingInterval(null)
        }
      }
    } catch (error) {
      console.error('[useProgressiveRecommendations] Polling error:', error)
      // Continue polling even on error
    }
  }, [batchId, isPolling])

  // Set up polling when we have a batch_id
  useEffect(() => {
    if (initialData?.metadata?.batch_id && initialData?.metadata?.progressive_mode) {
      setBatchId(initialData.metadata.batch_id)
      setIsPolling(true)
      
      // Set initial recommendations
      setAccumulatedRecommendations(initialData.recommendations || [])
      
      console.log('[useProgressiveRecommendations] Starting polling for batch:', initialData.metadata.batch_id)
    }
  }, [initialData])

  // Polling effect
  useEffect(() => {
    if (!isPolling || !batchId) return
    
    const interval = setInterval(() => {
      pollForRecommendations()
    }, 2000) // Poll every 2 seconds
    
    return () => clearInterval(interval)
  }, [isPolling, batchId, pollForRecommendations])

  // Combine initial and polled recommendations
  const allRecommendations = [
    ...(initialData?.recommendations || []),
    ...accumulatedRecommendations.filter(r => 
      !initialData?.recommendations?.some(ir => ir.id === r.id)
    )
  ]

  return {
    recommendations: allRecommendations,
    isLoading,
    isPolling,
    error,
    metadata: initialData?.metadata || null,
    refetch,
    totalGaps: initialData?.total_gaps || 0,
    summary: initialData?.summary || ''
  }
}