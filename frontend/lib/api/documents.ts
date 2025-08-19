/**
 * Document API service
 */

import { apiClient, apiRequest } from '../api-client';
import type { 
  ProcessedDocument, 
  DocumentListResponse, 
  DocumentFilters, 
  DocumentStats,
  GlobalDocumentStats 
} from '@/types/document';

export const documentsApi = {
  /**
   * Get organization documents
   */
  async getDocuments(params?: {
    page?: number;
    pageSize?: number;
    filters?: DocumentFilters;
    includeGlobal?: boolean;
  }): Promise<DocumentListResponse> {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    
    // CRITICAL: Control global document inclusion for tenant isolation
    const includeGlobal = params?.includeGlobal || false;
    
    console.log('[DOCUMENTS_API] Fetching documents with params:', {
      page,
      pageSize,
      offset,
      includeGlobal,
      filters: params?.filters
    });
    
    const data = await apiRequest<any>('GET', '/api/v1/documents/', null, {
      params: {
        limit: pageSize,
        offset: offset,
        status: params?.filters?.status,
        search: params?.filters?.search,
        include_global: includeGlobal,  // ❌ CRITICAL: Explicitly control global inclusion
        // Note: backend doesn't support these yet
        // document_type: params?.filters?.documentType,
        // source: params?.filters?.source,
      },
    });
    
    console.log('[DOCUMENTS_API] Response:', { 
      documentsCount: data.documents?.length, 
      total: data.total,
      includeGlobal 
    });
    
    // Transform backend response to match frontend interface
    return {
      documents: data.documents,
      total: data.total,
      page: page,
      pageSize: pageSize,
    };
  },

  /**
   * Get single document
   */
  async getDocument(documentId: string): Promise<ProcessedDocument> {
    const data = await apiClient.get<ProcessedDocument>(`/api/v1/documents/${documentId}`);
    return data;
  },

  /**
   * Upload organization document
   */
  async uploadDocument(params: {
    file: File;
    title: string;
    tags?: string[];
  }): Promise<ProcessedDocument> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('title', params.title);
    if (params.tags) {
      formData.append('tags', JSON.stringify(params.tags));
    }

    const data = await apiClient.post<ProcessedDocument>('/api/v1/documents/upload', formData);
    return data;
  },

  /**
   * Delete document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await apiClient.delete(`/api/v1/documents/${documentId}`);
  },

  /**
   * Reprocess failed document
   */
  async reprocessDocument(documentId: string): Promise<ProcessedDocument> {
    const data = await apiClient.post<any>(`/api/v1/documents/${documentId}/process`);
    return data;
  },

  /**
   * Get document statistics
   */
  async getDocumentStats(): Promise<DocumentStats> {
    const data = await apiClient.get<DocumentStats>('/api/v1/documents/stats');
    
    // Handle null/undefined response
    if (!data) {
      return {
        totalDocuments: 0,
        totalSizeBytes: 0,
        statusBreakdown: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0
        }
      };
    }
    
    return data;
  },
};

export const globalDocumentsApi = {
  /**
   * Get global documents (admin only)
   */
  async getGlobalDocuments(params?: {
    page?: number;
    pageSize?: number;
    filters?: DocumentFilters;
  }): Promise<DocumentListResponse> {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const offset = (page - 1) * pageSize;
    
    const data = await apiRequest<any>('GET', '/api/v1/admin/documents/global', null, {
      params: {
        limit: pageSize,
        offset: offset,
        status: params?.filters?.status,
        document_type: params?.filters?.documentType,
        source: params?.filters?.source,
        // search: params?.filters?.search, // Backend doesn't support search yet
      },
    });
    
    // Transform backend response to match frontend interface
    // Backend returns 'items' field, not 'documents'
    return {
      documents: data.items || [],  // ← Fixed: use 'items' from backend
      total: data.total,
      page: page,
      pageSize: pageSize,
    };
  },

  /**
   * Upload global document (admin only)
   */
  async uploadGlobalDocument(params: {
    file: File;
    title: string;
    documentType: string;
    source: string;
    tags?: string[];
  }): Promise<ProcessedDocument> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('title', params.title);
    formData.append('document_type', params.documentType);
    formData.append('source', params.source);
    if (params.tags) {
      formData.append('tags', JSON.stringify(params.tags));
    }

    const data = await apiClient.post<ProcessedDocument>('/api/v1/admin/documents/global', formData);
    return data;
  },

  /**
   * Delete global document (admin only)
   */
  async deleteGlobalDocument(documentId: string): Promise<void> {
    await apiClient.delete(`/api/v1/admin/documents/global/${documentId}`);
  },

  /**
   * Reprocess global document (admin only)
   */
  async reprocessGlobalDocument(documentId: string): Promise<ProcessedDocument> {
    const data = await apiClient.post<any>(`/api/v1/admin/documents/global/${documentId}/reprocess`);
    return data;
  },

  /**
   * Get global document statistics (admin only)
   */
  async getGlobalDocumentStats(): Promise<GlobalDocumentStats> {
    const data = await apiClient.get<GlobalDocumentStats>('/api/v1/admin/documents/global/stats');
    return data;
  },
};