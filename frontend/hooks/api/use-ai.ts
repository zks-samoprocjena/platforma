import { useQuery, useMutation, type UseQueryResult } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { apiRequest } from '@/lib/api-client'
import type { 
  AISearchRequest,
  AISearchResult,
  AIQuestionRequest,
  AIQuestionResponse,
  AIRecommendationRequest,
  AIControlGuidanceRequest,
  AIRoadmapRequest,
  AIRoadmapResponse,
  Recommendation
} from '@/types/api'
import type { AIRecommendation } from '@/types/assessment'

// Query keys
export const aiKeys = {
  all: ['ai'] as const,
  search: (query: string) => [...aiKeys.all, 'search', query] as const,
  recommendations: (assessmentId: string, organizationId: string) => [...aiKeys.all, 'recommendations', assessmentId, organizationId] as const,
  guidance: (controlId: string) => [...aiKeys.all, 'guidance', controlId] as const,
  roadmap: (assessmentId: string) => [...aiKeys.all, 'roadmap', assessmentId] as const,
}

// AI Search Hook
export function useAISearch(request: AISearchRequest, enabled: boolean = true) {
  return useQuery({
    queryKey: aiKeys.search(request.query),
    queryFn: () => {
      console.log('[useAISearch] Making search request:', request)
      return apiRequest<AISearchResult[]>('POST', '/api/v1/ai/search', request)
    },
    enabled: enabled && !!request.query.trim(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// AI Question Mutation
export function useAIQuestion() {
  return useMutation({
    mutationFn: (request: AIQuestionRequest) => {
      console.log('[useAIQuestion] Making question request:', {
        question: request.question,
        organization_id: request.organization_id,
        assessment_id: request.assessment_id,
        control_id: request.control_id,
        context: request.context,
        language: request.language
      })
      
      return apiRequest<AIQuestionResponse>('POST', '/api/v1/ai/question', request)
    },
    onSuccess: (response) => {
      console.log('[useAIQuestion] Question response received:', {
        answerPreview: response.answer?.substring(0, 100),
        language: response.language,
        sourcesCount: response.sources?.length || 0,
        confidence: response.confidence,
        context_length: response.context_length,
        generation_time: response.generation_time
      })
    },
    onError: (error) => {
      console.error('[useAIQuestion] Question request failed:', error)
    }
  })
}

// AI Recommendations Hook with Progressive Loading Support
export function useAIRecommendations(
  assessmentId: string, 
  organizationId: string, 
  options?: {
    enabled?: boolean,
    offset?: number,
    limit?: number,
    excludeControlIds?: string[]
  }
) {
  const { enabled = true, offset = 0, limit = 3, excludeControlIds = [] } = options || {}
  
  return useQuery({
    queryKey: aiKeys.recommendations(assessmentId, organizationId),
    queryFn: async () => {
      console.log('[useAIRecommendations] Fetching recommendations for:', {
        assessmentId,
        organizationId,
        offset,
        limit,
        excludeCount: excludeControlIds.length,
        timestamp: new Date().toISOString()
      })
      
      const response = await apiRequest<{ 
        recommendations: AIRecommendation[], 
        total_recommendations: number, 
        summary?: string,
        total_gaps?: number,
        metadata?: {
          offset: number,
          limit: number,
          has_more: boolean,
          remaining_gaps: number,
          total_available: number
        }
      }>('POST', '/api/v1/ai/recommendations', {
        assessment_id: assessmentId,
        organization_id: organizationId,
        offset: offset,
        max_recommendations: limit,
        exclude_control_ids: excludeControlIds.length > 0 ? excludeControlIds : undefined
      })
      
      console.log('[useAIRecommendations] API Response received:', {
        recommendationsCount: response.recommendations?.length || 0,
        totalRecommendations: response.total_recommendations,
        hasRecommendations: Array.isArray(response.recommendations),
        timestamp: new Date().toISOString()
      })
      
      // Extract the recommendations array from the nested response
      const rawRecommendations = response.recommendations || []
      
      // Transform backend recommendation format to frontend AIRecommendation format
      const recommendations: AIRecommendation[] = rawRecommendations.map((rec: any, index: number) => ({
        id: rec.id || `recommendation-${index}`,
        title: rec.title || rec.control_name || `Improvement for Control ${rec.control_id}`,
        description: rec.description || rec.recommendation || 'AI-generated recommendation for improving compliance',
        priority: rec.priority || 'medium',
        effort_estimate: rec.effort_estimate || 'medium',
        timeline_weeks: rec.timeline_weeks || rec.estimated_weeks || 4,
        compliance_impact: rec.compliance_impact || rec.target_score || 0,
        implementation_steps: rec.implementation_steps || [],
        source_references: rec.source_references || rec.sources?.map((s: any) => s.source) || [],
        category: rec.category || 'implementation',
        control_ids: rec.control_ids || (rec.control_id ? [rec.control_id] : [])
      }))
      
      console.log('[useAIRecommendations] Transformed recommendations:', {
        rawCount: rawRecommendations.length,
        transformedCount: recommendations.length,
        firstRecommendation: recommendations[0] ? {
          id: recommendations[0].id,
          title: recommendations[0].title,
          priority: recommendations[0].priority
        } : null,
        timestamp: new Date().toISOString()
      })
      
      return {
        recommendations,
        metadata: response.metadata || {
          offset: 0,
          limit: 3,
          has_more: false,
          remaining_gaps: 0,
          total_available: response.total_gaps || 0
        },
        summary: response.summary,
        total_gaps: response.total_gaps || 0
      }
    },
    enabled: enabled && !!assessmentId && !!organizationId,
    staleTime: 0, // Always consider data stale to allow immediate refetch
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  })
}

// AI Control Guidance Hook
export function useAIControlGuidance(
  controlId: string,
  organizationId: string,
  enabled: boolean = true
): UseQueryResult<AIQuestionResponse, Error> {
  return useQuery<AIQuestionResponse>({
    queryKey: aiKeys.guidance(controlId),
    queryFn: () => {
      const request = { 
        control_id: controlId,
        organization_id: organizationId,
        language: 'hr' // TODO: Make this configurable based on locale
      }
      
      console.log('[useAIControlGuidance] Making guidance request:', request)
      
      return apiRequest<AIQuestionResponse>('POST', '/api/v1/ai/control/guidance', request)
    },
    enabled: enabled && !!controlId && !!organizationId,
    staleTime: 15 * 60 * 1000 // 15 minutes (guidance doesn't change often)
  })
}

// Progressive AI Recommendations Hook with Database Support
export function useProgressiveAIRecommendations(assessmentId: string, organizationId: string) {
  const [allRecommendations, setAllRecommendations] = useState<AIRecommendation[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [metadata, setMetadata] = useState<any>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [filters, setFilters] = useState<{
    priority?: string
    effort_estimate?: string
    is_implemented?: boolean
  }>({})
  const [sortBy, setSortBy] = useState<'impact_score' | 'priority' | 'effort' | 'created_at'>('impact_score')
  
  // Load existing recommendations from database first
  const existingQuery = useQuery({
    queryKey: ['ai', 'recommendations', 'list', assessmentId, organizationId, filters, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('organization_id', organizationId)  // Add required organization_id
      params.append('limit', '100')  // Fetch up to 100 recommendations
      if (filters.priority) params.append('priority', filters.priority)
      if (filters.effort_estimate) params.append('effort_estimate', filters.effort_estimate)
      if (filters.is_implemented !== undefined) params.append('is_implemented', String(filters.is_implemented))
      params.append('sort_by', sortBy)
      
      const response = await apiRequest<{
        recommendations: any[]
        total: number
      }>('GET', `/api/v1/ai/recommendations/${assessmentId}/list?${params.toString()}`)
      
      return response.recommendations.map((rec: any) => ({
        id: rec.id,
        title: rec.title,
        description: rec.description || rec.content,
        priority: rec.priority,
        effort_estimate: rec.effort_estimate,
        timeline_weeks: rec.timeline_weeks || 4,
        compliance_impact: rec.impact_score || rec.target_score || 0,
        implementation_steps: rec.implementation_steps || [],
        source_references: rec.source_references || [],
        category: rec.category || 'improvement',
        control_ids: rec.control_id ? [rec.control_id] : [],
        is_implemented: rec.is_implemented || false,
        created_at: rec.created_at,
        measure_name: rec.measure_name,
        control_name: rec.control_name
      }))
    },
    enabled: !!assessmentId && !!organizationId
  })
  
  // Update all recommendations when existing query succeeds
  useEffect(() => {
    if (existingQuery.data && !isLoadingMore && !isPolling) {
      // Only reset if we're not in the middle of loading more or polling
      setAllRecommendations(existingQuery.data)
      setOffset(existingQuery.data.length)
    }
  }, [existingQuery.data, isLoadingMore, isPolling])
  
  // Poll for background recommendations
  const pollForRecommendations = useCallback(async () => {
    if (!batchId || !isPolling) {
      console.log('[useProgressiveAIRecommendations] Skipping poll:', { batchId, isPolling })
      return
    }
    
    console.log('[useProgressiveAIRecommendations] Polling for batch:', batchId)
    
    try {
      const response = await apiRequest<{
        batch_id: string
        recommendations: any[]
        count: number
        status: string
      }>('GET', `/api/v1/ai/recommendations/batch/${batchId}`)
      
      console.log('[useProgressiveAIRecommendations] Poll response:', {
        count: response.recommendations?.length || 0,
        status: response.status
      })
      
      if (response.recommendations && response.recommendations.length > 0) {
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
          control_ids: rec.control_id ? [rec.control_id] : [],
          is_implemented: false,
          created_at: rec.created_at
        }))
        
        // Add new recommendations avoiding duplicates
        setAllRecommendations(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const uniqueNew = newRecommendations.filter(r => !existingIds.has(r.id))
          return [...prev, ...uniqueNew]
        })
        
        // Stop polling if complete
        if (response.status === 'completed') {
          setIsPolling(false)
          setBatchId(null)
          // Refetch from DB to ensure we have all recommendations
          existingQuery.refetch()
        }
      }
    } catch (error) {
      console.error('[useProgressiveAIRecommendations] Polling error:', error)
    }
  }, [batchId, isPolling])
  
  // Set up polling interval
  useEffect(() => {
    if (!isPolling || !batchId) return
    
    const interval = setInterval(() => {
      pollForRecommendations()
    }, 2000) // Poll every 2 seconds
    
    return () => clearInterval(interval)
  }, [isPolling, batchId, pollForRecommendations])
  
  // Function to generate new recommendations (progressive loading)
  const generateMore = async () => {
    console.log('[useProgressiveAIRecommendations] generateMore called', {
      isLoadingMore,
      currentRecommendationsCount: allRecommendations.length,
      offset
    })
    
    if (isLoadingMore) return
    
    setIsLoadingMore(true)
    
    try {
      const excludeIds = allRecommendations
        .map(rec => rec.control_ids[0])
        .filter(Boolean)
      
      console.log('[useProgressiveAIRecommendations] Making API request with:', {
        assessmentId,
        organizationId,
        offset,
        excludeIdsCount: excludeIds.length
      })
      
      const response = await apiRequest<any>('POST', '/api/v1/ai/recommendations', {
        assessment_id: assessmentId,
        organization_id: organizationId,
        offset: offset,
        max_recommendations: 5,  // Request 5 recommendations
        exclude_control_ids: excludeIds
      })
      
      console.log('[useProgressiveAIRecommendations] Full API Response:', response)
      console.log('[useProgressiveAIRecommendations] API Response metadata:', response.metadata)
      
      // Transform and append new recommendations
      const newRecommendations = response.recommendations.map((rec: any) => ({
        id: rec.id,
        title: rec.title || rec.control_name || `Improvement for Control ${rec.control_id}`,
        description: rec.description || rec.recommendation || 'AI-generated recommendation',
        priority: rec.priority || 'medium',
        effort_estimate: rec.effort_estimate || 'medium',
        timeline_weeks: rec.timeline_weeks || rec.estimated_weeks || 4,
        compliance_impact: rec.compliance_impact || rec.target_score || 0,
        implementation_steps: rec.implementation_steps || [],
        source_references: rec.source_references || rec.sources?.map((s: any) => s.source) || [],
        category: rec.category || 'implementation',
        control_ids: rec.control_ids || (rec.control_id ? [rec.control_id] : []),
        is_implemented: false,
        created_at: new Date().toISOString(),
        measure_name: rec.measure_name,
        control_name: rec.control_name
      }))
      
      // If progressive mode, add first recommendation and start polling
      if (response.metadata?.progressive_mode && response.metadata?.batch_id) {
        console.log('[useProgressiveAIRecommendations] Progressive mode activated:', {
          batchId: response.metadata.batch_id,
          firstRecommendationsCount: newRecommendations.length,
          remainingGaps: response.metadata.remaining_gaps
        })
        setBatchId(response.metadata.batch_id)
        setIsPolling(true)
        // Add only the first recommendation immediately
        setAllRecommendations(prev => [...prev, ...newRecommendations])
      } else {
        // Add all recommendations if not progressive
        setAllRecommendations(prev => [...prev, ...newRecommendations])
        // Only refetch from DB if not in progressive mode
        await existingQuery.refetch()
      }
      
      setOffset(prev => prev + newRecommendations.length)
      setHasMore(response.metadata?.has_more || false)
      setMetadata(response.metadata)
    } catch (error) {
      console.error('[useProgressiveAIRecommendations] Generate more failed:', error)
      console.error('[useProgressiveAIRecommendations] Error details:', {
        message: (error as any)?.message,
        response: (error as any)?.response,
        stack: (error as any)?.stack
      })
      throw error  // Re-throw to let the panel handle it
    } finally {
      setIsLoadingMore(false)
    }
  }
  
  // Function to regenerate a specific recommendation
  const regenerateRecommendation = async (recommendationId: string) => {
    try {
      const response = await apiRequest<any>('POST', `/api/v1/ai/recommendations/${recommendationId}/regenerate?organization_id=${organizationId}`)
      
      // Update the recommendation in the local state
      if (response && response.id) {
        setAllRecommendations(prev => prev.map(rec => 
          rec.id === recommendationId ? {
            ...rec,
            ...response,
            // Ensure we keep the UI fields
            measure_name: rec.measure_name,
            control_name: rec.control_name
          } : rec
        ))
      }
      
      // Also refetch to ensure consistency
      await existingQuery.refetch()
    } catch (error) {
      console.error('[useProgressiveAIRecommendations] Regenerate failed:', error)
      throw error
    }
  }
  
  return {
    recommendations: allRecommendations,
    isLoading: existingQuery.isLoading,
    isLoadingMore,
    isPolling,
    hasMore,
    generateMore,
    regenerateRecommendation,
    metadata,
    refetch: existingQuery.refetch,
    error: existingQuery.error,
    filters,
    setFilters,
    sortBy,
    setSortBy
  }
}

// AI Roadmap Hook - now a query for better UX
export function useAIRoadmap(assessmentId: string, organizationId: string, language: 'hr' | 'en' = 'hr', enabled: boolean = true) {
  return useQuery({
    queryKey: aiKeys.roadmap(assessmentId),
    queryFn: () => {
      const request = {
        assessment_id: assessmentId,
        organization_id: organizationId,
        language
      }
      
      console.log('[useAIRoadmap] Making roadmap request:', request)
      
      return apiRequest<AIRoadmapResponse>('POST', '/api/v1/ai/roadmap', request)
    },
    enabled: enabled && !!assessmentId && !!organizationId,
    staleTime: 15 * 60 * 1000 // 15 minutes
  })
}

// AI Roadmap Generation Mutation (kept for manual regeneration)
export function useAIRoadmapGeneration() {
  return useMutation({
    mutationFn: (request: AIRoadmapRequest) => {
      console.log('[useAIRoadmapGeneration] Making roadmap generation request:', request)
      
      return apiRequest<AIRoadmapResponse>('POST', '/api/v1/ai/roadmap', request)
    },
    onSuccess: (response) => {
      console.log('[useAIRoadmapGeneration] Roadmap generation response received:', {
        phases: Array.isArray((response as any).phases) ? (response as any).phases.length : 0,
        total_estimated_effort: (response as any).total_estimated_effort
      })
    },
    onError: (error) => {
      console.error('[useAIRoadmapGeneration] Roadmap generation failed:', error)
    }
  })
}

// AI Health Check Hook
export function useAIHealth() {
  return useQuery({
    queryKey: [...aiKeys.all, 'health'],
    queryFn: () => {
      console.log('[useAIHealth] Checking AI health')
      return apiRequest<{ status: string; capabilities: string[] }>('GET', '/api/v1/ai/health')
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000 // Check every 5 minutes
  })
}

// AI Feedback Mutation
export function useAIFeedback() {
  return useMutation({
    mutationFn: (feedback: { 
      interaction_id: string
      rating: 1 | 2 | 3 | 4 | 5
      comment?: string
      helpful: boolean
    }) => {
      console.log('[useAIFeedback] Submitting feedback:', feedback)
      return apiRequest<void>('POST', '/api/v1/ai/feedback', feedback)
    },
    onSuccess: () => {
      console.log('[useAIFeedback] Feedback submitted successfully')
    },
    onError: (error) => {
      console.error('[useAIFeedback] Feedback submission failed:', error)
    }
  })
}