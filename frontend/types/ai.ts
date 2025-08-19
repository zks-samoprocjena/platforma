export interface QuestionRequest {
  question: string;
  organization_id: string;
  assessment_id?: string;
  control_id?: string;
  context?: string;
  language: 'hr' | 'en';
}

export interface QuestionResponse {
  question: string;
  answer: string;
  sources: SourceInfo[];
  confidence: number;
  context_length: number;
  generation_time?: number;
  language: string;
  context_used?: boolean;
  assessment_context?: any;
}

export interface SourceInfo {
  source: string;
  relevance_score: number;
  excerpt?: string;
}

export interface SearchRequest {
  query: string;
  organization_id: string;
  limit?: number;
  score_threshold?: number;
  language?: 'hr' | 'en';
  filter_metadata?: Record<string, any>;
  content_preview_length?: number;
}

export interface SearchResult {
  content: string;
  content_full: string;
  score: number;
  metadata: Record<string, any>;
  document_name?: string;
  document_type?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
  language: string;
}

export interface RecommendationRequest {
  assessment_id: string;
  organization_id: string;
  control_ids?: string[];
}

export interface RecommendationItem {
  control_id: string;
  control_name: string;
  current_score: number;
  target_score: number;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  generated_at: string;
  implementation_steps?: string[];
  estimated_effort?: string;
  sources?: SourceInfo[];
}

export interface RecommendationResponse {
  assessment_id: string;
  recommendations: RecommendationItem[];
  total_recommendations: number;
  summary?: string;
  total_gaps?: number;
  mandatory_gaps?: number;
}