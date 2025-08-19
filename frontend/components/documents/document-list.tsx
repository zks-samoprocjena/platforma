/**
 * Document list component
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { 
  DocumentIcon, 
  ArrowPathIcon, 
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DocumentStatusBadge } from './document-status';
import { useDeleteDocument, useReprocessDocument, useDeleteGlobalDocument, useReprocessGlobalDocument } from '@/hooks/api/use-documents';
import type { ProcessedDocument, DocumentStatus } from '@/types/document';

interface DocumentListProps {
  documents: ProcessedDocument[];
  isLoading?: boolean;
  isGlobal?: boolean;
  onSearchChange?: (search: string) => void;
  onStatusFilterChange?: (status: DocumentStatus | 'all') => void;
  className?: string;
}

export function DocumentList({ 
  documents, 
  isLoading,
  isGlobal = false,
  onSearchChange,
  onStatusFilterChange,
  className 
}: DocumentListProps) {
  const t = useTranslations('documents');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<ProcessedDocument | null>(null);

  const deleteDocument = useDeleteDocument();
  const reprocessDocument = useReprocessDocument();
  const deleteGlobalDocument = useDeleteGlobalDocument();
  const reprocessGlobalDocument = useReprocessGlobalDocument();

  const handleDelete = (document: ProcessedDocument) => {
    setDocumentToDelete(document);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    
    setDeletingId(documentToDelete.id);
    setDeleteConfirmOpen(false);
    
    try {
      if (isGlobal) {
        await deleteGlobalDocument.mutateAsync(documentToDelete.id);
      } else {
        await deleteDocument.mutateAsync(documentToDelete.id);
      }
    } finally {
      setDeletingId(null);
      setDocumentToDelete(null);
    }
  };

  const handleReprocess = async (document: ProcessedDocument) => {
    if (isGlobal) {
      await reprocessGlobalDocument.mutateAsync(document.id);
    } else {
      await reprocessDocument.mutateAsync(document.id);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    onSearchChange?.(value);
  };

  const handleStatusFilterChange = (value: DocumentStatus | 'all') => {
    setStatusFilter(value);
    onStatusFilterChange?.(value);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <FunnelIcon className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            <SelectItem value="pending">{t('status.pending')}</SelectItem>
            <SelectItem value="processing">{t('status.processing')}</SelectItem>
            <SelectItem value="completed">{t('status.completed')}</SelectItem>
            <SelectItem value="failed">{t('status.failed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Document table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('documentTitle')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('status.label')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('uploadDate')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('size')}
              </th>
              {isGlobal && (
                <>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('documentType.label')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('source.label')}
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={isGlobal ? 7 : 5} className="px-6 py-4 text-center">
                  <div className="flex justify-center">
                    <svg
                      className="animate-spin h-6 w-6 text-gray-400"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={isGlobal ? 7 : 5} className="px-6 py-8 text-center">
                  <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {t('noDocuments')}
                  </p>
                </td>
              </tr>
            ) : (
              documents.map((document) => (
                <tr key={document.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <DocumentIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {document.title}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {document.fileName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <DocumentStatusBadge status={document.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(document.uploadDate), 'dd.MM.yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatFileSize(document.fileSize)}
                  </td>
                  {isGlobal && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {document.documentType && t(`documentType.${document.documentType}`)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {document.source && t(`source.${document.source.toLowerCase()}`)}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {document.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReprocess(document)}
                          disabled={reprocessDocument.isPending || reprocessGlobalDocument.isPending}
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(document)}
                        disabled={deletingId === document.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('deleteTitle')}
        description={t('deleteConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
}