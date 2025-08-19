'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DocumentList } from '@/components/documents/document-list';
import { DocumentUpload } from '@/components/documents/document-upload';
import { useDocuments, useDocumentStats } from '@/hooks/api/use-documents';
import { Skeleton } from '@/components/ui/skeleton';
import type { DocumentStatus, DocumentFilters } from '@/types/document';

export function DocumentsClient() {
  const t = useTranslations('documents');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<DocumentFilters>({});
  
  const { data: documentsData, isLoading } = useDocuments({
    page: currentPage,
    pageSize: 20,
    filters,
    includeGlobal: false,  // ❌ CHANGED: Don't include global documents for organization users
  });

  const { data: stats } = useDocumentStats();

  const handleSearchChange = (search: string) => {
    setFilters(prev => ({ ...prev, search }));
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (status: DocumentStatus | 'all') => {
    setFilters(prev => ({ 
      ...prev, 
      status: status === 'all' ? undefined : status 
    }));
    setCurrentPage(1);
  };

  const handleUploadSuccess = () => {
    setShowUploadDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {t('organizationDocuments')}
        </p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.statusBreakdown?.processing || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.statusBreakdown?.failed || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>{t('organizationDocuments')}</CardTitle>
              <CardDescription>
                Upload and manage documents for AI-powered compliance assistance
              </CardDescription>
            </div>
            <Button onClick={() => setShowUploadDialog(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              {t('upload')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <DocumentList
              documents={documentsData?.documents || []}
              isLoading={isLoading}
              onSearchChange={handleSearchChange}
              onStatusFilterChange={handleStatusFilterChange}
            />
          )}

          {/* Pagination */}
          {documentsData && documentsData.total > documentsData.pageSize && (
            <div className="mt-6 flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-sm">
                Page {currentPage} of {Math.ceil(documentsData.total / documentsData.pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage >= Math.ceil(documentsData.total / documentsData.pageSize)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('upload')}</DialogTitle>
            <DialogDescription>
              Upload a document to enhance AI compliance recommendations
            </DialogDescription>
          </DialogHeader>
          <DocumentUpload onSuccess={handleUploadSuccess} />
        </DialogContent>
      </Dialog>
    </div>
  );
}