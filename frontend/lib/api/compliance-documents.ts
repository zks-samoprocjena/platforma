import { apiClient } from '../api-client';

export interface DocumentTemplate {
  id: string;
  name: string;
  version: string;
  document_type: DocumentType;
  description?: string;
  is_active: boolean;
}

export enum DocumentType {
  COMPLIANCE_DECLARATION = 'compliance_declaration',
  SELF_ASSESSMENT_REPORT = 'self_assessment_report',
  INTERNAL_RECORD = 'internal_record',
  EVALUATION_REPORT = 'evaluation_report',
  ACTION_PLAN = 'action_plan',
}

export interface DocumentTypeCapabilities {
  supportsAIAnalysis: boolean;
  supportsRecommendations: boolean;
  supportsRoadmap: boolean;
}

export const DOCUMENT_TYPE_CAPABILITIES: Record<DocumentType, DocumentTypeCapabilities> = {
  [DocumentType.COMPLIANCE_DECLARATION]: {
    supportsAIAnalysis: false,
    supportsRecommendations: false,
    supportsRoadmap: false,
  },
  [DocumentType.SELF_ASSESSMENT_REPORT]: {
    supportsAIAnalysis: true,
    supportsRecommendations: true,
    supportsRoadmap: true,
  },
  [DocumentType.INTERNAL_RECORD]: {
    supportsAIAnalysis: false,
    supportsRecommendations: false,
    supportsRoadmap: false,
  },
  [DocumentType.EVALUATION_REPORT]: {
    supportsAIAnalysis: true,
    supportsRecommendations: true,
    supportsRoadmap: true,
  },
  [DocumentType.ACTION_PLAN]: {
    supportsAIAnalysis: false,
    supportsRecommendations: false,
    supportsRoadmap: true,
  },
};

export interface DocumentGenerationRequest {
  assessment_id: string;
  template_version?: string;
  options?: {
    include_ai_analysis?: boolean;
    language?: 'hr' | 'en';
    include_recommendations?: boolean;
    include_roadmap?: boolean;
    [key: string]: any;
  };
}

export interface BatchGenerationRequest {
  assessment_id: string;
  document_types: DocumentType[];
  options?: DocumentGenerationRequest['options'];
}

export interface DocumentGenerationJob {
  id: string;
  document_id: string;
  document_type: DocumentType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  result_url?: string;
}

export interface GeneratedDocument {
  id: string;
  document_type: DocumentType;
  template_version: string;
  file_path: string;
  file_size: number;
  created_at: string;
  download_url?: string;
  status?: string;
  job_id?: string;
  error_message?: string;
}

class ComplianceDocumentsAPI {
  /**
   * Generate a single compliance document
   */
  async generateDocument(
    documentType: DocumentType,
    request: DocumentGenerationRequest
  ): Promise<{ job_id: string; document_id: string }> {
    const response = await apiClient.post<{ job_id: string; document_id: string }>(
      `/api/v1/compliance-documents/generate/${documentType}`,
      request
    );
    return response;
  }

  /**
   * Generate multiple compliance documents in batch
   */
  async generateBatch(
    request: BatchGenerationRequest
  ): Promise<{ jobs: Array<{ job_id: string; document_id: string; document_type: DocumentType }> }> {
    const response = await apiClient.post<{ jobs: Array<{ job_id: string; document_id: string; document_type: DocumentType }> }>(
      '/api/v1/compliance-documents/generate/batch',
      request
    );
    return response;
  }

  /**
   * Get document generation job status
   */
  async getJobStatus(documentId: string): Promise<DocumentGenerationJob> {
    const response = await apiClient.get<DocumentGenerationJob>(
      `/api/v1/compliance-documents/${documentId}/status`
    );
    return response;
  }

  /**
   * Get available document templates
   */
  async getTemplates(): Promise<DocumentTemplate[]> {
    const response = await apiClient.get<DocumentTemplate[]>('/api/v1/compliance-documents/templates');
    return response;
  }

  /**
   * Get all generated documents for an assessment
   */
  async getAssessmentDocuments(
    assessmentId: string
  ): Promise<GeneratedDocument[]> {
    const response = await apiClient.get<any[]>(
      `/api/v1/compliance-documents/assessment/${assessmentId}/generated`
    );
    
    // Map API response to GeneratedDocument interface
    return response.map(doc => ({
      id: doc.document_id, // API returns document_id, frontend expects id
      document_type: doc.document_type,
      template_version: doc.template_version || 'latest',
      file_path: doc.file_path || '',
      file_size: doc.file_size || 0,
      created_at: doc.created_at,
      download_url: doc.download_url,
      status: doc.status,
      job_id: doc.job_id,
      error_message: doc.error_message
    }));
  }

  /**
   * Download a generated document
   */
  async downloadDocument(documentId: string): Promise<Blob> {
    // Use apiRequest from api-client but handle blob response
    const { apiRequest } = await import('../api-client');
    const { getAccessToken } = await import('../auth');
    
    // Get the API base URL from the same place apiClient uses it
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    // Get auth token
    const token = await getAccessToken();
    
    // Build headers
    const headers: Record<string, string> = {
      'Accept': 'application/pdf, text/html, */*'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Use fetch directly for binary file downloads
    // We can't use apiRequest here because it expects JSON responses
    const response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/download`, {
      method: 'GET',
      credentials: 'include',
      headers
    });

    if (!response.ok) {
      // Try to parse error as JSON first
      try {
        const error = await response.json();
        throw new Error(error.detail || `Download failed: ${response.statusText}`);
      } catch {
        throw new Error(`Download failed: ${response.statusText}`);
      }
    }

    return response.blob();
  }

  /**
   * Poll for job completion
   */
  async waitForCompletion(
    documentId: string,
    options: {
      maxAttempts?: number;
      interval?: number;
      onProgress?: (job: DocumentGenerationJob) => void;
    } = {}
  ): Promise<DocumentGenerationJob> {
    const { maxAttempts = 60, interval = 2000, onProgress } = options;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const job = await this.getJobStatus(documentId);
      
      if (onProgress) {
        onProgress(job);
      }
      
      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Document generation timeout');
  }

  /**
   * Get document type display name
   */
  getDocumentTypeDisplayName(type: DocumentType, locale: 'hr' | 'en' = 'hr'): string {
    const names = {
      hr: {
        [DocumentType.COMPLIANCE_DECLARATION]: 'Izjava o sukladnosti',
        [DocumentType.SELF_ASSESSMENT_REPORT]: 'Izvještaj o samoprocjeni',
        [DocumentType.INTERNAL_RECORD]: 'Interni zapisnik o samoprocjeni',
        [DocumentType.EVALUATION_REPORT]: 'Evaluacijski izvještaj po mjerama',
        [DocumentType.ACTION_PLAN]: 'Akcijski plan za poboljšanja',
      },
      en: {
        [DocumentType.COMPLIANCE_DECLARATION]: 'Compliance Declaration',
        [DocumentType.SELF_ASSESSMENT_REPORT]: 'Self-Assessment Report',
        [DocumentType.INTERNAL_RECORD]: 'Internal Assessment Record',
        [DocumentType.EVALUATION_REPORT]: 'Measures Evaluation Report',
        [DocumentType.ACTION_PLAN]: 'Improvement Action Plan',
      },
    };
    
    return names[locale][type] || type;
  }

  /**
   * Get document type icon
   */
  getDocumentTypeIcon(type: DocumentType): string {
    const icons = {
      [DocumentType.COMPLIANCE_DECLARATION]: '📋',
      [DocumentType.SELF_ASSESSMENT_REPORT]: '📊',
      [DocumentType.INTERNAL_RECORD]: '📝',
      [DocumentType.EVALUATION_REPORT]: '📈',
      [DocumentType.ACTION_PLAN]: '📌',
    };
    
    return icons[type] || '📄';
  }

  /**
   * Delete a generated document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await apiClient.delete(`/api/v1/compliance-documents/${documentId}`);
    // Explicitly return void to ensure proper handling of 204 responses
    return;
  }

  /**
   * Get combined capabilities for selected document types
   */
  getCombinedCapabilities(documentTypes: DocumentType[]): DocumentTypeCapabilities {
    if (documentTypes.length === 0) {
      return {
        supportsAIAnalysis: false,
        supportsRecommendations: false,
        supportsRoadmap: false,
      };
    }

    // If any selected document type supports a feature, enable it
    return {
      supportsAIAnalysis: documentTypes.some(type => DOCUMENT_TYPE_CAPABILITIES[type].supportsAIAnalysis),
      supportsRecommendations: documentTypes.some(type => DOCUMENT_TYPE_CAPABILITIES[type].supportsRecommendations),
      supportsRoadmap: documentTypes.some(type => DOCUMENT_TYPE_CAPABILITIES[type].supportsRoadmap),
    };
  }
}

export const complianceDocumentsAPI = new ComplianceDocumentsAPI();