/**
 * Document-related type definitions
 */

export interface ProcessedDocument {
  id: string;
  organizationId?: string | null;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  status: DocumentStatus;
  uploadDate: string;
  processedDate?: string;
  scope: DocumentScope;
  isGlobal: boolean;
  documentType?: DocumentType;
  source?: DocumentSource;
  uploadedBy?: string;
  processingMetadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type DocumentScope = 'organization' | 'global';
export type DocumentType = 'standard' | 'regulation' | 'guideline' | 'policy' | 'procedure' | 'best_practice' | 'other';
export type DocumentSource = 'ISO' | 'NIST' | 'ZKS' | 'NIS2' | 'other';

export interface DocumentUploadRequest {
  file: File;
  title: string;
  tags?: string[];
  documentType?: DocumentType;
  source?: DocumentSource;
}

export interface DocumentListResponse {
  documents: ProcessedDocument[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DocumentFilters {
  status?: DocumentStatus;
  documentType?: DocumentType;
  source?: DocumentSource;
  search?: string;
}

export interface DocumentStats {
  totalDocuments: number;
  totalSizeBytes: number;
  statusBreakdown: Record<DocumentStatus, number>;
  averageProcessingTime?: number;
}

export interface GlobalDocumentStats {
  totalDocuments: number;
  totalSizeBytes: number;
  statusBreakdown: Record<DocumentStatus, number>;
  typeDistribution: Record<DocumentType, number>;
  sourceDistribution: Record<DocumentSource, number>;
  supportedLanguages: string[];
}