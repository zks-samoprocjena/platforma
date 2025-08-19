import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { useOrganization } from '@/hooks/useAuth'
import type { 
  Assessment, 
  AssessmentProgress, 
  AssessmentAnswer,
  AssessmentStatus,
  SecurityLevel,
  CreateAssessmentRequest,
  CreateAssessmentResponse,
  UpdateAssessmentRequest,
  AssessmentResults,
  AssessmentResultsResponse,
  AssessmentQuestionnaire,
  AssessmentDetailResponse,
  AssessmentInsights
} from '@/types/assessment'
import type { PaginatedResponse } from '@/types/api'

// Query keys
export const assessmentKeys = {
  all: ['assessments'] as const,
  lists: () => [...assessmentKeys.all, 'list'] as const,
  list: (filters: any) => [...assessmentKeys.lists(), { filters }] as const,
  details: () => [...assessmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...assessmentKeys.details(), id] as const,
  progress: (id: string) => [...assessmentKeys.detail(id), 'progress'] as const,
  results: (id: string) => [...assessmentKeys.detail(id), 'results'] as const,
  questionnaire: (id: string) => [...assessmentKeys.detail(id), 'questionnaire'] as const,
  insights: (id: string) => [...assessmentKeys.detail(id), 'insights'] as const,
}

interface AssessmentListParams {
  page?: number
  per_page?: number
  status?: AssessmentStatus
  security_level?: SecurityLevel
  search?: string
}

// Hooks
export function useAssessments(params: AssessmentListParams = {}) {
  const { organizationId } = useOrganization()
  
  return useQuery({
    queryKey: assessmentKeys.list({ ...params, organizationId }),
    queryFn: async () => {
      // CRITICAL: Ensure organization_id is always provided for multi-tenant security
      if (!organizationId) {
        console.error('[useAssessments] No organization ID available - this is a security issue!')
        console.error('[useAssessments] Organization context:', { organizationId })
        throw new Error('Organization ID is required for assessment queries')
      }
      
      const requestParams = {
        organization_id: organizationId,
        search_term: params.search,
        status: params.status,
        security_level: params.security_level,
        limit: params.per_page || 20,
        offset: ((params.page || 1) - 1) * (params.per_page || 20),
        exclude_archived: true // Exclude archived assessments by default
      }
      
      console.log('[USE_ASSESSMENTS] Fetching V3 assessments with params:', requestParams)
      console.log('[USE_ASSESSMENTS] Organization ID type:', typeof organizationId, 'value:', organizationId)
      
      const response = await apiRequest<any>('GET', '/api/v1/assessments/', null, { 
        params: requestParams
      })
      
      console.log('[USE_ASSESSMENTS] V3 API Response:', response)
      console.log('[USE_ASSESSMENTS] Total count received:', response?.total_count)
      
      // V3 endpoint returns progress fields directly on the assessment
      // and uses different response structure
      const assessments = response?.assessments || []
      const total = response?.total_count || 0
      
      console.log('[USE_ASSESSMENTS] Parsed data:', { total, assessmentsCount: assessments.length })
      
      return {
        items: assessments.map((assessment: any) => ({
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          organization_id: assessment.organization_id,
          security_level: assessment.security_level,
          status: assessment.status,
          created_at: assessment.created_at,
          updated_at: assessment.updated_at,
          created_by: assessment.created_by,
          updated_by: assessment.updated_by,
          assigned_to: assessment.assigned_to,
          total_controls: assessment.total_controls || 0,
          answered_controls: assessment.answered_controls || 0,
          mandatory_controls: assessment.mandatory_controls || 0,
          mandatory_answered: assessment.mandatory_answered || 0,
          // Use completion_percentage from response or calculate if needed
          progress: {
            total_controls: assessment.total_controls || 0,
            completed_controls: assessment.answered_controls || 0,
            completion_percentage: assessment.completion_percentage || 0
          },
          // Add compliance percentage if available
          compliance_percentage: assessment.compliance_percentage
        })),
        total: total,
        page: params.page || 1,
        per_page: params.per_page || 20,
        total_pages: Math.ceil(total / (params.per_page || 20))
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!organizationId, // Only fetch if we have an organization ID
  })
}

export function useAssessment(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: assessmentKeys.detail(id),
    queryFn: async () => {
      console.log('[USE_ASSESSMENT] Fetching assessment detail from V3 API:', id)
      
      // Use V2 API for consistent progress data with M:N support
      const response = await apiRequest<any>('GET', `/api/v1/assessments/${id}`)
      
      console.log('[USE_ASSESSMENT] V3 API Response:', response)
      
      // V3 API should already provide properly structured progress data
      if (response.assessment && !response.assessment.progress) {
        console.warn('[USE_ASSESSMENT] V3 API did not provide progress data, creating fallback')
        response.assessment.progress = {
          total_controls: response.assessment.total_controls || 0,
          completed_controls: response.assessment.answered_controls || 0,
          mandatory_controls: response.assessment.mandatory_controls || 0,
          completed_mandatory: response.assessment.mandatory_answered || 0,
          completion_percentage: response.assessment.completion_percentage || 0,
          mandatory_completion_percentage: response.assessment.mandatory_completion_percentage || 0,
          last_updated: response.assessment.updated_at
        }
      }
      
      return response as AssessmentDetailResponse
    },
    enabled: enabled && !!id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Convenience hook for components that only need the assessment data (backward compatibility)
export function useAssessmentData(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: assessmentKeys.detail(id),
    queryFn: async () => {
      const response = await apiRequest<any>('GET', `/api/v1/assessments/${id}`)
      
      // Map backend fields to frontend progress structure
      if (response.assessment) {
        response.assessment.progress = response.assessment.total_controls ? {
          total_controls: response.assessment.total_controls,
          completed_controls: response.assessment.answered_controls || 0,
          mandatory_controls: response.assessment.mandatory_controls || 0,
          completed_mandatory: response.assessment.mandatory_answered || 0,
          completion_percentage: response.assessment.total_controls > 0 
            ? Math.round((response.assessment.answered_controls || 0) / response.assessment.total_controls * 100)
            : 0,
          sections_completed: 0,
          total_sections: 0,
          last_activity: response.assessment.updated_at
        } : undefined
      }
      
      return response as AssessmentDetailResponse
    },
    select: (data) => data.assessment, // Extract just the assessment object
    enabled: enabled && !!id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useAssessmentProgress(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: assessmentKeys.progress(id),
    queryFn: () => apiRequest<AssessmentProgress>('GET', `/api/v1/assessments/${id}/progress`),
    enabled: enabled && !!id,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  })
}

export function useAssessmentResults(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: assessmentKeys.results(id),
    queryFn: () => apiRequest<AssessmentResultsResponse>('GET', `/api/v1/assessments/${id}/results`),
    enabled: enabled && !!id,
    staleTime: 1 * 60 * 1000, // 1 minute
  })
}

export function useAssessmentQuestionnaire(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: assessmentKeys.questionnaire(id),
    queryFn: () => apiRequest<AssessmentQuestionnaire>('GET', `/api/v1/assessments/${id}/questionnaire`),
    enabled: enabled && !!id,
    staleTime: 30 * 1000, // 30 seconds to ensure scores are updated
    refetchOnWindowFocus: true,
  })
}

// Mutations
export function useCreateAssessment() {
  const queryClient = useQueryClient()
  const { organizationId } = useOrganization()

  return useMutation({
    mutationFn: (data: CreateAssessmentRequest) => {
      // Use V2 API endpoint with M:N support
      const url = '/api/v1/assessments/'
      
      // Ensure organization_id is included in the request
      const requestData = {
        ...data,
        organization_id: data.organization_id || organizationId  // Use the provided org_id or fallback to context
      }
      
      console.log('[useCreateAssessment] Creating assessment with data:', requestData)
      console.log('[useCreateAssessment] URL:', url)
      
      return apiRequest<CreateAssessmentResponse>('POST', url, requestData)
    },
    onMutate: async (newAssessment) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: assessmentKeys.lists() })
      
      // Snapshot previous value
      const previousAssessments = queryClient.getQueriesData({ queryKey: assessmentKeys.lists() })
      
      // Get current user ID from Keycloak token
      const keycloak = (window as any).keycloak
      const userId = keycloak?.tokenParsed?.sub || ''
      
      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: assessmentKeys.lists() },
        (old: any) => {
          if (!old?.items) return old
          
          const optimisticAssessment: Assessment = {
            id: `temp-${Date.now()}`,
            title: newAssessment.title,
            description: newAssessment.description,
            security_level: newAssessment.security_level,
            status: 'draft' as AssessmentStatus,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            organization_id: organizationId || '',
            created_by: userId || ''
          }
          
          return {
            ...old,
            items: [optimisticAssessment, ...old.items],
            total: old.total + 1
          }
        }
      )
      
      return { previousAssessments }
    },
    onError: (err, newAssessment, context) => {
      // Rollback optimistic update
      if (context?.previousAssessments) {
        context.previousAssessments.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
    },
  })
}

export function useUpdateAssessment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssessmentRequest }) =>
      apiRequest<Assessment>('PUT', `/api/v1/assessments/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
    },
  })
}

export function useTransitionAssessmentStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      apiRequest<any>('PUT', `/api/v1/assessments/${id}/status`, {
        new_status: status,
        reason: reason
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
    },
  })
}

export function useDeleteAssessment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/api/v1/assessments/${id}`),
    onMutate: async (deletedId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: assessmentKeys.lists() })
      
      // Snapshot previous value
      const previousAssessments = queryClient.getQueriesData({ queryKey: assessmentKeys.lists() })
      
      // Optimistically remove from lists
      queryClient.setQueriesData(
        { queryKey: assessmentKeys.lists() },
        (old: any) => {
          if (!old?.items) return old
          
          return {
            ...old,
            items: old.items.filter((assessment: Assessment) => assessment.id !== deletedId),
            total: Math.max(old.total - 1, 0)
          }
        }
      )
      
      return { previousAssessments }
    },
    onError: (err, deletedId, context) => {
      // Rollback optimistic update
      if (context?.previousAssessments) {
        context.previousAssessments.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
    },
  })
}

export function useUpdateAssessmentAnswers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assessmentId, answers }: { assessmentId: string; answers: AssessmentAnswer[] }) => {
      // Always use v2 API for proper compliance calculation and authentication
      const cleanedAnswers = answers.map(answer => {
        // Validate required fields
        if (!answer.control_id || !answer.submeasure_id) {
          throw new Error('control_id and submeasure_id are required for each answer')
        }
        
        const cleaned: any = { 
          control_id: answer.control_id,
          submeasure_id: answer.submeasure_id  // Required field for M:N context
        }
        if (answer.documentation_score !== undefined && answer.documentation_score !== null) {
          cleaned.documentation_score = answer.documentation_score
        }
        if (answer.implementation_score !== undefined && answer.implementation_score !== null) {
          cleaned.implementation_score = answer.implementation_score
        }
        if (answer.comments !== undefined && answer.comments !== null) {
          cleaned.comments = answer.comments
        }
        if (answer.evidence_files !== undefined && answer.evidence_files !== null) {
          cleaned.evidence_files = answer.evidence_files
        }
        if (answer.confidence_level !== undefined && answer.confidence_level !== null) {
          cleaned.confidence_level = answer.confidence_level
        }
        return cleaned
      })
      
      // Use V2 single endpoint for one answer, batch endpoint for multiple answers
      if (cleanedAnswers.length === 1) {
        return apiRequest<void>('PUT', `/api/v1/assessments/${assessmentId}/answers`, cleanedAnswers[0])
      } else {
        return apiRequest<void>('PUT', `/api/v1/assessments/${assessmentId}/answers/batch`, { answers: cleanedAnswers })
      }
    },
    onSuccess: (_, { assessmentId }) => {
      // Invalidate related queries to trigger refetch with real data
      queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(assessmentId) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.questionnaire(assessmentId) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.results(assessmentId) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(assessmentId) })
      // Also invalidate v2 queries
      queryClient.invalidateQueries({ queryKey: ['assessments-v2', assessmentId] })
    },
  })
}

export function useSubmitAnswers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ assessmentId, answers }: { assessmentId: string; answers: Partial<AssessmentAnswer>[] }) =>
      apiRequest<void>('PUT', `/api/v1/assessments/${assessmentId}/answers`, answers),
    onMutate: async ({ assessmentId, answers }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: assessmentKeys.progress(assessmentId) })
      
      // Snapshot previous values
      const previousProgress = queryClient.getQueryData(assessmentKeys.progress(assessmentId))
      
      // Optimistically update progress
      queryClient.setQueryData(
        assessmentKeys.progress(assessmentId),
        (old: any) => {
          if (!old) return old
          
          return {
            ...old,
            answered_controls: old.answered_controls + answers.length,
            completion_percentage: Math.min(
              ((old.answered_controls + answers.length) / old.total_controls) * 100,
              100
            )
          }
        }
      )
      
      return { previousProgress }
    },
    onError: (err, { assessmentId }, context) => {
      // Rollback optimistic update
      if (context?.previousProgress) {
        queryClient.setQueryData(assessmentKeys.progress(assessmentId), context.previousProgress)
      }
    },
    onSuccess: (_, { assessmentId }) => {
      // Invalidate related queries to trigger refetch with real data
      queryClient.invalidateQueries({ queryKey: assessmentKeys.progress(assessmentId) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.results(assessmentId) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(assessmentId) })
    },
  })
}

export function useSubmitAssessment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiRequest<Assessment>('POST', `/api/v1/assessments/${id}/submit`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
    },
  })
}

export function useDuplicateAssessment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiRequest<Assessment>('POST', `/api/v1/assessments/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
      // Note: Toast notifications should be handled by the component using this hook
    },
  })
}

export function useArchiveAssessment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/api/v1/assessments/${id}`),
    onSuccess: (_, id) => {
      // Remove from cache immediately
      queryClient.setQueriesData(
        { queryKey: assessmentKeys.lists() },
        (old: any) => {
          if (!old?.items) return old
          return {
            ...old,
            items: old.items.filter((item: Assessment) => item.id !== id),
            total: old.total - 1
          }
        }
      )
      
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) })
    },
  })
}

export function useExportAssessmentPDF() {
  return useMutation({
    mutationFn: async (id: string) => {
      // TODO: Implement PDF export endpoint when backend is ready
      // For now, return a placeholder
      throw new Error('PDF export not yet implemented')
    },
  })
}

// New hooks for compliance features
export function useAssessmentCompliance(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...assessmentKeys.detail(id), 'compliance'] as const,
    queryFn: () => apiRequest<any>('GET', `/api/v1/assessments/${id}/compliance`),
    enabled: enabled && !!id,
    staleTime: 1 * 60 * 1000, // 1 minute
  })
}

export function useValidateSubmission(id: string) {
  return useMutation({
    mutationFn: () => apiRequest<any>('POST', `/api/v1/assessments/${id}/validate-submission`),
  })
}

export function useRecalculateCompliance(id: string) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: () => apiRequest<any>('POST', `/api/v1/assessments/${id}/recalculate`),
    onSuccess: () => {
      // Invalidate all related queries to force refresh
      queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: assessmentKeys.results(id) })
      queryClient.invalidateQueries({ queryKey: [...assessmentKeys.detail(id), 'compliance'] })
    },
  })
}

export function useAssessmentInsights(id: string, refreshIfStale: boolean = true) {
  return useQuery({
    queryKey: assessmentKeys.insights(id),
    queryFn: async () => {
      const url = `/api/v1/assessments/${id}/insights`
      const params = refreshIfStale ? { refresh_if_stale: true } : undefined
      return apiRequest<AssessmentInsights>('GET', url, null, { params })
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRefreshAssessmentInsights() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/v1/assessments/${id}/insights/refresh`
      return apiRequest<AssessmentInsights>('POST', url)
    },
    onSuccess: (data, id) => {
      // Update cache immediately with refreshed snapshot
      queryClient.setQueryData(assessmentKeys.insights(id), data)
      // Ensure any listeners refetch if needed
      queryClient.invalidateQueries({ queryKey: assessmentKeys.insights(id) })
    }
  })
}