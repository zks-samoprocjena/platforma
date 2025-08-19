'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-hot-toast';
import { 
  GeneratedDocument,
  complianceDocumentsAPI 
} from '@/lib/api/compliance-documents';
import { formatDistanceToNow } from 'date-fns';
import { hr, enUS } from 'date-fns/locale';
import { useLocale } from 'next-intl';

interface GeneratedDocumentsListProps {
  assessmentId: string;
  refreshTrigger?: boolean;
}

export function GeneratedDocumentsList({
  assessmentId,
  refreshTrigger,
}: GeneratedDocumentsListProps) {
  const t = useTranslations('ComplianceDocuments');
  const locale = useLocale();
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<GeneratedDocument | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const docs = await complianceDocumentsAPI.getAssessmentDocuments(assessmentId);
      const sortedDocs = docs.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setDocuments(sortedDocs);
      
      // Calculate total pages
      const total = Math.ceil(sortedDocs.length / itemsPerPage);
      setTotalPages(total);
      
      // Reset to page 1 if current page is out of bounds
      if (currentPage > total && total > 0) {
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast.error(t('errors.fetchFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [assessmentId, t, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshTrigger]);

  const handleDownload = async (doc: GeneratedDocument) => {
    if (downloadingIds.has(doc.id)) return;

    setDownloadingIds(prev => new Set(prev).add(doc.id));

    try {
      const blob = await complianceDocumentsAPI.downloadDocument(doc.id);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${complianceDocumentsAPI.getDocumentTypeDisplayName(
        doc.document_type,
        locale as 'hr' | 'en'
      )}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(t('download.success'));
    } catch (error) {
      console.error('Download failed:', error);
      toast.error(t('download.failed'));
    } finally {
      setDownloadingIds(prev => {
        const updated = new Set(prev);
        updated.delete(doc.id);
        return updated;
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDeleteClick = (doc: GeneratedDocument) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;

    setDeletingIds(prev => new Set(prev).add(documentToDelete.id));
    setDeleteDialogOpen(false);

    try {
      await complianceDocumentsAPI.deleteDocument(documentToDelete.id);
      
      // Calculate new values before state updates
      const remainingDocs = documents.filter(d => d.id !== documentToDelete.id);
      const newTotal = Math.ceil(remainingDocs.length / itemsPerPage);
      
      // Remove from local state
      setDocuments(remainingDocs);
      
      // Update pagination
      setTotalPages(newTotal);
      
      // Adjust current page if necessary
      if (currentPage > newTotal && newTotal > 0) {
        setCurrentPage(newTotal);
      }
      
      toast.success(t('delete.success'));
    } catch (error) {
      console.error('Delete failed:', error);
      console.error('Error type:', typeof error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      });
      toast.error(t('delete.failed'));
    } finally {
      setDeletingIds(prev => {
        const updated = new Set(prev);
        updated.delete(documentToDelete.id);
        return updated;
      });
      setDocumentToDelete(null);
    }
  };

  // Calculate paginated documents
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDocuments = documents.slice(startIndex, endIndex);

  // Pagination handlers
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (isLoading) {
    return (
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex justify-center items-center h-32">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <h3 className="card-title text-lg">{t('generatedDocuments')}</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={fetchDocuments}
            title={t('actions.refresh')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-8 text-base-content/60">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 mx-auto mb-4 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p>{t('noDocuments')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>{t('table.type')}</th>
                  <th>{t('table.version')}</th>
                  <th>{t('table.size')}</th>
                  <th>{t('table.created')}</th>
                  <th>{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">
                          {complianceDocumentsAPI.getDocumentTypeIcon(doc.document_type)}
                        </span>
                        <span className="font-medium">
                          {complianceDocumentsAPI.getDocumentTypeDisplayName(
                            doc.document_type,
                            locale as 'hr' | 'en'
                          )}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-outline">
                        {doc.template_version}
                      </span>
                    </td>
                    <td>{formatFileSize(doc.file_size)}</td>
                    <td>
                      <span title={new Date(doc.created_at).toLocaleString()}>
                        {formatDistanceToNow(new Date(doc.created_at), {
                          addSuffix: true,
                          locale: locale === 'hr' ? hr : enUS,
                        })}
                      </span>
                    </td>
                    <td>
                      <div className="flex space-x-2">
                        <button
                          className={`btn btn-primary btn-sm ${
                            downloadingIds.has(doc.id) ? 'loading' : ''
                          }`}
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingIds.has(doc.id)}
                        >
                          {downloadingIds.has(doc.id) ? (
                            ''
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                              />
                            </svg>
                          )}
                          {t('actions.download')}
                        </button>
                        <button
                          className={`btn btn-error btn-sm ${
                            deletingIds.has(doc.id) ? 'loading' : ''
                          }`}
                          onClick={() => handleDeleteClick(doc)}
                          disabled={deletingIds.has(doc.id)}
                          title={t('actions.delete')}
                        >
                          {deletingIds.has(doc.id) ? (
                            ''
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center mt-6 gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                
                <div className="flex gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, idx) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = idx + 1;
                    } else if (currentPage <= 3) {
                      pageNum = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + idx;
                    } else {
                      pageNum = currentPage - 2 + idx;
                    }
                    
                    return (
                      <button
                        key={idx}
                        className={`btn btn-sm ${
                          currentPage === pageNum ? 'btn-primary' : ''
                        }`}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  className="btn btn-sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                
                <span className="text-sm text-base-content/60 ml-4">
                  {t('pagination.page')} {currentPage} / {totalPages}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && documentToDelete && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">{t('delete.confirmTitle')}</h3>
            <p className="py-4">
              {t('delete.confirmMessage', {
                documentType: complianceDocumentsAPI.getDocumentTypeDisplayName(
                  documentToDelete.document_type,
                  locale as 'hr' | 'en'
                )
              })}
            </p>
            <div className="alert alert-warning">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>{t('delete.warning')}</span>
            </div>
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDocumentToDelete(null);
                }}
              >
                {t('actions.cancel')}
              </button>
              <button
                className="btn btn-error"
                onClick={handleDeleteConfirm}
              >
                {t('actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}