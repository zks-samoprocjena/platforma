export type AssessmentStatus = 'draft' | 'in_progress' | 'review' | 'completed' | 'abandoned' | 'archived'
export type SecurityLevel = 'osnovna' | 'srednja' | 'napredna'

export interface AssessmentProgress {
  total_controls: number
  completed_controls: number
  mandatory_controls: number
  completed_mandatory: number
  completion_percentage: number
  sections_completed: number
  total_sections: number
  last_activity: string
  // Aliases used by V2/V3 APIs and UI components
  answered_controls?: number
  mandatory_answered?: number
}

export interface AssessmentScores {
  average_documentation_score: number
  average_implementation_score: number
  compliance_score: number
  mandatory_compliance_score: number
  voluntary_compliance_score: number
  by_measure: Record<string, {
    documentation_score: number
    implementation_score: number
    compliance_score: number
  }>
}

export interface Assessment {
  id: string
  organization_id: string
  title: string
  description?: string
  security_level: SecurityLevel
  status: AssessmentStatus
  progress?: AssessmentProgress
  current_scores?: AssessmentScores
  created_at: string
  updated_at: string
  created_by: string
  updated_by?: string
  assigned_to?: string[]
  submitted_at?: string
  submitted_by?: string
  due_date?: string
  tags?: string[]
  // Optional fields returned by list/detail APIs and used in UI
  total_controls?: number
  answered_controls?: number
  mandatory_controls?: number
  mandatory_answered?: number
  completion_percentage?: number
  mandatory_completion_percentage?: number
  compliance_percentage?: number
  completed_at?: string
}

export interface CreateAssessmentRequest {
  title: string
  description?: string
  organization_id: string
  security_level: SecurityLevel
  due_date?: string
  assigned_to?: string[]
}

export interface CreateAssessmentResponse {
  success: boolean
  assessment_id: string
  title: string
  status: string
  security_level: string
  created_at: string
}

export interface UpdateAssessmentRequest {
  title?: string
  description?: string
  status?: AssessmentStatus
  due_date?: string
  tags?: string[]
}

export interface AssessmentAnswer {
  control_id: string
  submeasure_id: string  // Required for submeasure-specific answers
  documentation_score?: number | null
  implementation_score?: number | null
  comments?: string | null
  evidence_files?: string[]
  confidence_level?: number | null
}

export interface SubmitAnswersRequest {
  answers: AssessmentAnswer[]
}

export interface ControlRatingGuidance {
  score: number
  documentation_criteria: string
  implementation_criteria: string
}

export interface AssessmentControl {
  id: string
  code: string
  name_hr: string
  description_hr?: string
  order_index: number
  is_mandatory: boolean  // Deprecated - use submeasure_context
  requirement_id: string
  security_level: string
  documentation_score: number | null
  implementation_score: number | null
  comments?: string | null
  evidence_files?: string[]
  answered_at?: string | null
  answered_by?: string | null
  // New fields for minimum score requirements
  minimum_score?: number | null
  submeasure_id?: string | null  // Deprecated - use submeasure_context
  submeasure_context?: {  // New: context for current submeasure
    submeasure_id: string
    is_mandatory: boolean
    minimum_score: number
  }
  meets_minimum?: boolean | null
  rating_guidance?: ControlRatingGuidance[]
  submeasure_ids?: string[]  // New: all submeasures this control belongs to
}

export interface AssessmentSubmeasure {
  id: string
  code: string
  name_hr: string
  description_hr?: string
  order_index: number
  controls: AssessmentControl[]
  // Aggregate scoring fields
  total_controls: number
  answered_controls: number
  mandatory_controls: number
  mandatory_answered: number
  documentation_avg?: number | null
  implementation_avg?: number | null
  overall_score?: number | null
  passes_threshold?: boolean | null
}

export interface AssessmentMeasure {
  id: string
  code: string
  name_hr: string
  description_hr?: string
  order_index: number
  submeasures: AssessmentSubmeasure[]
  // Aggregate fields
  total_controls: number
  answered_controls: number
  mandatory_controls: number
  mandatory_answered: number
  overall_score?: number | null
}

export interface AssessmentQuestionnaire {
  assessment_id: string
  security_level: string
  version_id: string
  measures: AssessmentMeasure[]
  statistics: {
    total_measures: number
    total_submeasures: number
    total_controls: number
    mandatory_controls: number
    voluntary_controls: number
  }
  generated_at: string
}

export interface MeasureResult {
  measure_id: string
  measure_title: string
  measure_code: string
  compliance_percentage: number
  avg_documentation_score?: number
  avg_implementation_score?: number
  total_controls: number
  answered_controls: number
  mandatory_total: number
  mandatory_completed: number
  submeasure_count: number
  control_count: number
  gap_areas?: string[]
}

export interface AssessmentResults {
  assessment_id: string
  overall_compliance_percentage: number
  mandatory_compliance_percentage: number
  voluntary_compliance_percentage: number
  documentation_average: number
  implementation_average: number
  total_controls: number
  answered_controls: number
  mandatory_total: number
  mandatory_completed: number
  measure_results?: MeasureResult[]
  by_measure: Record<string, {
    measure_code: string
    measure_name: string
    compliance_score: number
    documentation_score: number
    implementation_score: number
    total_controls: number
    completed_controls: number
  }>
  gaps: Array<{
    control_id: string
    control_code: string
    control_name: string
    gap_score: number
    is_mandatory: boolean
    current_documentation: number
    current_implementation: number
  }>
  recommendations: string[]
}

export interface GapAnalysisItem {
  id: string
  control_id: string
  control_title: string
  measure_title: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: 'mandatory' | 'implementation' | 'documentation'
  current_score: number
  target_score: number
  gap_score: number
  effort_estimate: 'high' | 'medium' | 'low'
  timeline_weeks: number
  impact_description: string
  recommendations: string[]
}

export interface AIRecommendation {
  id: string
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  effort_estimate: 'high' | 'medium' | 'low'
  timeline_weeks: number
  compliance_impact: number
  implementation_steps?: string[]
  source_references?: string[]
  category?: string
  control_ids?: string[]
  is_implemented?: boolean
  created_at?: string
  measure_name?: string
  control_name?: string
}

// Compliance Scoring Types
export interface SubmeasureResult {
  submeasure_id: string
  submeasure_code: string
  documentation_avg?: number
  implementation_avg?: number
  overall_score: number
  passes_individual_threshold: boolean
  passes_average_threshold: boolean
  passes_overall: boolean
  mandatory_controls_count?: number
  failed_controls: string[]
  control_count?: number  // Added for total controls in submeasure
  answered_count?: number  // Added for answered controls
  mandatory_count?: number  // Added for mandatory controls
  mandatory_answered?: number  // Added for answered mandatory controls
  // New fields from enhanced API
  total_controls?: number
  answered_controls?: number
  mandatory_controls?: number
  
}

export interface MeasureResultCompliance {
  measure_id: string
  measure_code: string
  overall_score: number
  documentation_avg?: number  // Added from API response
  implementation_avg?: number  // Added from API response
  compliance_percentage?: number  // Added from API response
  passes_compliance: boolean
  total_submeasures: number
  passed_submeasures: number
  critical_failures: string[]
  submeasures?: SubmeasureResult[]  // Added to support nested submeasures
  // Control count fields from MeasureScore model
  total_controls?: number  // Added from stored model
  answered_controls?: number  // Added from stored model
  mandatory_controls?: number  // Added from stored model
  mandatory_answered?: number  // Added from stored model
}

export interface ComplianceResult {
  overall_compliance_score: number
  compliance_percentage: number
  passes_compliance: boolean
  total_measures: number
  passed_measures: number
  maturity_score: number
  maturity_threshold: number
  meets_maturity_trend: boolean
  security_level: string
  thresholds: {
    individual: number
    average: number
  }
}

export interface AssessmentResultsResponse {
  assessment_id: string
  overall_score: number
  compliance_percentage: number
  measure_results: MeasureResultCompliance[]
  submeasure_results: SubmeasureResult[]
  calculated_at: string
  statistics: {
    total_controls: number
    answered_controls: number
    mandatory_controls: number
    mandatory_answered: number
    compliance: ComplianceResult
  }
}

// API Response Types - Backend returns nested structure
export interface AssessmentDetailResponse {
  assessment: Assessment
  scores: Record<string, any>
  progress: Record<string, any>
  validation: Record<string, any>
  active_users: number
  statistics: Record<string, any>
  valid_transitions: string[]
}

// V2 API Types with M:N support
export interface ControlInQuestionnaireResponseV2 {
  control: {
    id: string
    code: string
    name: string
    description: string
    guidance?: string
  }
  context: {
    submeasure_id: string
    is_mandatory: boolean
    minimum_score: number
  }
  answer?: {
    id: string
    documentation_score?: number
    implementation_score?: number
    overall_score?: number
    comments?: string
    evidence_files?: string[]
  }
}

export interface SubmeasureInQuestionnaireResponseV2 {
  id: string
  number: string
  name: string
  description?: string
  controls: ControlInQuestionnaireResponseV2[]
  statistics: {
    total_controls: number
    mandatory_controls: number
    answered_controls: number
    mandatory_answered: number
    mandatory_meeting_minimum: number
    compliance_percentage: number
    compliance_issues: string[]
  }
}

export interface MeasureInQuestionnaireResponseV2 {
  id: string
  number: string
  name: string
  description?: string
  submeasures: SubmeasureInQuestionnaireResponseV2[]
  statistics: {
    total_controls: number
    answered_controls: number
    compliance_percentage: number
  }
}

export interface QuestionnaireResponseV2 {
  assessment_id: string
  security_level: string
  measures: MeasureInQuestionnaireResponseV2[]
  statistics: {
    total_controls: number
    unique_controls: number  // Since controls can appear in multiple submeasures
    answered_controls: number
    completion_percentage: number
    compliance_score: number
    mandatory_controls: number
    mandatory_answered: number
  }
}

// V3 API Types
export interface ComplianceStatus {
  assessment_id: string
  security_level: string
  status: 'compliant' | 'non_compliant' | 'in_progress'
  passed_submeasures: number
  total_submeasures: number
  passed_measures: number
  total_measures: number
  average_score: number
  minimum_score: number
  target_average: number
  compliance_percentage: number
  maturity_score: number
  maturity_threshold: number
  details: {
    measure_compliance: {
      measure_id: string
      measure_code: string
      measure_name: string
      passed_submeasures: number
      total_submeasures: number
      is_compliant: boolean
    }[]
    submeasure_compliance: {
      submeasure_id: string
      submeasure_code: string
      submeasure_name: string
      average_score: number
      all_controls_pass: boolean
      is_compliant: boolean
      control_details: {
        control_id: string
        control_code: string
        score: number
        minimum_required: number
        passes: boolean
      }[]
    }[]
  }
}

export interface ValidationResult {
  is_valid: boolean
  errors: string[]
  warnings: string[]
  mandatory_complete: boolean
  missing_mandatory: {
    control_id: string
    control_code: string
    control_name: string
    submeasure_code: string
  }[]
  statistics: {
    total_controls: number
    answered_controls: number
    mandatory_controls: number
    mandatory_answered: number
  }
}

export interface AssessmentInsightsGapItem {
  control_id: string
  control_code: string
  control_name: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  is_mandatory: boolean
  current_score?: number | null
  target_score?: number | null
  recommendation?: string | null
}

export interface AssessmentInsightsRoadmapItem {
  control_id: string
  control_name: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  recommendation?: string | null
}

export interface AssessmentInsightsRoadmapPhase {
  name: string
  duration: string
  description: string
  items: AssessmentInsightsRoadmapItem[]
}

export interface AssessmentInsights {
  assessment_id: string
  computed_at?: string | null
  gaps: AssessmentInsightsGapItem[]
  roadmap: {
    summary: string
    total_items: number
    phases: AssessmentInsightsRoadmapPhase[]
  }
  ai_summary?: string | null
  measures_ai: {
    measures: Array<{
      code: string
      name: string
      ai_summary?: string
      controls: Array<{
        control_id: string
        control_code: string
        control_name: string
        ai_recommendation?: string | null
      }>
    }>
  }
  status: 'ok' | 'stale' | 'error'
  source_version: string
}