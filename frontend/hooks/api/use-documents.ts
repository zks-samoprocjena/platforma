/**
 * React Query hooks for document operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { documentsApi, globalDocumentsApi } from '@/lib/api/documents';
import type { DocumentFilters } from '@/types/document';

/**
 * Hook to fetch organization documents
 */
export function useDocuments(params?: {
  page?: number;
  pageSize?: number;
  filters?: DocumentFilters;
  includeGlobal?: boolean;
}) {
  return useQuery({
    queryKey: ['documents', params],
    queryFn: () => documentsApi.getDocuments(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch a single document
 */
export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: ['document', documentId],
    queryFn: () => documentId ? documentsApi.getDocument(documentId) : null,
    enabled: !!documentId,
  });
}

/**
 * Hook to upload a document
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();
  const t = useTranslations('documents');

  return useMutation({
    mutationFn: documentsApi.uploadDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success(t('uploadSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('uploadError'));
    },
  });
}

/**
 * Hook to delete a document
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const t = useTranslations('documents');

  return useMutation({
    mutationFn: documentsApi.deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success(t('deleteSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('deleteError'));
    },
  });
}

/**
 * Hook to reprocess a document
 */
export function useReprocessDocument() {
  const queryClient = useQueryClient();
  const t = useTranslations('documents');

  return useMutation({
    mutationFn: documentsApi.reprocessDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success(t('reprocessSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('reprocessError'));
    },
  });
}

/**
 * Hook to fetch document statistics
 */
export function useDocumentStats() {
  return useQuery({
    queryKey: ['document-stats'],
    queryFn: documentsApi.getDocumentStats,
    staleTime: 60000, // 1 minute
  });
}

// Admin hooks for global documents

/**
 * Hook to fetch global documents (admin only)
 */
export function useGlobalDocuments(params?: {
  page?: number;
  pageSize?: number;
  filters?: DocumentFilters;
}) {
  return useQuery({
    queryKey: ['global-documents', params],
    queryFn: () => globalDocumentsApi.getGlobalDocuments(params),
    staleTime: 30000,
  });
}

/**
 * Hook to upload a global document (admin only)
 */
export function useUploadGlobalDocument() {
  const queryClient = useQueryClient();
  const t = useTranslations('documents');

  return useMutation({
    mutationFn: globalDocumentsApi.uploadGlobalDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-documents'] });
      toast.success(t('uploadSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('uploadError'));
    },
  });
}

/**
 * Hook to delete a global document (admin only)
 */
export function useDeleteGlobalDocument() {
  const queryClient = useQueryClient();
  const t = useTranslations('documents');

  return useMutation({
    mutationFn: globalDocumentsApi.deleteGlobalDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-documents'] });
      toast.success(t('deleteSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('deleteError'));
    },
  });
}

/**
 * Hook to reprocess a global document (admin only)
 */
export function useReprocessGlobalDocument() {
  const queryClient = useQueryClient();
  const t = useTranslations('documents');

  return useMutation({
    mutationFn: globalDocumentsApi.reprocessGlobalDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-documents'] });
      toast.success(t('reprocessSuccess'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('reprocessError'));
    },
  });
}

/**
 * Hook to fetch global document statistics (admin only)
 */
export function useGlobalDocumentStats() {
  return useQuery({
    queryKey: ['global-document-stats'],
    queryFn: globalDocumentsApi.getGlobalDocumentStats,
    staleTime: 60000,
  });
}