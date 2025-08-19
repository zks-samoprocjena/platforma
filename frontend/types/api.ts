// Common API types
export interface APIResponse<T> {
  data: T
  message?: string
  success: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// User types
export interface User {
  id: string
  email: string
  name: string
  created_at: string
  updated_at: string
}

// Organization types
export interface Organization {
  id: string
  code: string
  name: string
  type: OrganizationType
  security_level: SecurityLevel
  description?: string
  active: boolean
  website?: string
  size?: OrganizationSize
  admin_user_id?: string
  registration_date?: string
  setup_completed: boolean
  created_at: string
  updated_at: string
}

export type OrganizationType = 'government' | 'private-sector' | 'critical-infrastructure' | 'other'
export type OrganizationSize = '1-10' | '11-50' | '51-250' | '250+'

export interface OrganizationCheckRequest {
  name?: string
  code?: string
}

export interface OrganizationCheckResponse {
  exists: boolean
  organization_id?: string
  exact_match?: boolean
}

export interface OrganizationRegisterRequest {
  name: string
  code: string
  type: OrganizationType
  security_level: SecurityLevel
  website?: string
  size?: OrganizationSize
  admin_user_id: string
}

export interface OrganizationRegisterResponse {
  organization_id: string
  requires_setup: boolean
  code: string
  name: string
}

// Assessment types
export interface Assessment {
  id: string
  title: string
  description?: string
  security_level: SecurityLevel
  status: AssessmentStatus
  progress_percentage: number
  overall_score?: number
  compliance_percentage?: number
  created_at: string
  updated_at: string
  created_by: string
  organization_id: string
}

export type SecurityLevel = 'osnovna' | 'srednja' | 'napredna'

export type AssessmentStatus = 'draft' | 'in_progress' | 'review' | 'completed' | 'archived'

// Control and measure types
export interface Measure {
  id: string
  code: string
  title: string
  description: string
  submeasures: Submeasure[]
}

export interface Submeasure {
  id: string
  code: string
  title: string
  description: string
  measure_id: string
  controls: Control[]
}

export interface Control {
  id: string
  code: string
  title: string
  description: string
  guidance?: string
  submeasure_ids: string[]  // Changed from single submeasure_id to array
  security_level: SecurityLevel
  is_mandatory: boolean  // Deprecated - use requirements per submeasure
  requirements?: {  // Requirements per submeasure context
    [submeasure_id: string]: {
      is_mandatory: boolean
      minimum_score: number
    }
  }
}

// Assessment answer types
export interface AssessmentAnswer {
  id: string
  assessment_id: string
  control_id: string
  submeasure_id?: string  // Added to track which submeasure context this answer applies to
  documentation_score?: number
  implementation_score?: number
  comments?: string
  evidence_files?: string[]
  answered_by: string
  answered_at: string
}

// Answer request types for v2 API
export interface UpdateAnswerRequestV2 {
  control_id: string
  submeasure_id: string  // Required for M:N context
  documentation_score?: number
  implementation_score?: number
  comments?: string
}

export interface BatchUpdateAnswersRequestV2 {
  answers: UpdateAnswerRequestV2[]
}

export interface AssessmentProgress {
  total_controls: number
  answered_controls: number
  mandatory_answered: number
  mandatory_total: number
  voluntary_answered: number
  voluntary_total: number
  completion_percentage: number
  can_submit: boolean
}

export interface AssessmentResults {
  overall_score: number
  compliance_percentage: number
  measure_scores: MeasureScore[]
  gap_analysis: GapAnalysis[]
  recommendations: Recommendation[]
}

export interface MeasureScore {
  measure_id: string
  measure_code: string
  measure_title: string
  score: number
  compliance_percentage: number
  total_controls: number
  answered_controls: number
}

export interface GapAnalysis {
  measure_id: string
  measure_title: string
  gap_level: 'critical' | 'high' | 'medium' | 'low'
  current_score: number
  target_score: number
  improvement_needed: number
  priority_controls: Control[]
}

export interface Recommendation {
  id: string
  type: 'immediate' | 'short_term' | 'medium_term' | 'long_term'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  implementation_effort: 'low' | 'medium' | 'high'
  estimated_timeline: string
  related_controls: string[]
  implementation_steps?: string[]
  compliance_impact?: number
  category?: string
}

// AI/RAG types
export interface AISearchRequest {
  query: string
  context?: string
  max_results?: number
}

export interface AISearchResult {
  content: string
  source: string
  relevance_score: number
  metadata: Record<string, any>
}

export interface AIQuestionRequest {
  question: string
  organization_id: string
  assessment_id?: string
  control_id?: string
  context?: string
  language?: 'hr' | 'en'
}

export interface AIQuestionResponse {
  answer: string
  sources: AISearchResult[]
  confidence: number
  language?: string
  context_length?: number
  generation_time?: number
  follow_up_questions?: string[]
}

export interface AIRecommendationRequest {
  assessment_id: string
  focus_areas?: string[]
  priority_level?: 'all' | 'high' | 'critical'
}

export interface AIControlGuidanceRequest {
  control_id: string
  current_score?: number
  organization_context?: string
}

export interface AIRoadmapRequest {
  assessment_id: string
  timeline_months: number
  budget_range?: 'low' | 'medium' | 'high'
  focus_areas?: string[]
}

export interface AIRoadmapResponse {
  roadmap_id: string
  timeline_months: number
  phases: RoadmapPhase[]
  total_estimated_effort: string
  key_milestones: Milestone[]
}

export interface RoadmapPhase {
  phase_number: number
  title: string
  duration_months: number
  objectives: string[]
  deliverables: string[]
  dependencies: string[]
  estimated_effort: string
}

export interface Milestone {
  title: string
  target_date: string
  completion_criteria: string[]
  stakeholders: string[]
}