'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentIcon, PlusIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DocumentList } from '@/components/documents/document-list';
import { DocumentUpload } from '@/components/documents/document-upload';
import { useGlobalDocuments, useGlobalDocumentStats } from '@/hooks/api/use-documents';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleGuard } from '@/components/role-guard';
import type { DocumentStatus, DocumentFilters } from '@/types/document';

export function AdminDocumentsClient() {
  const t = useTranslations('documents');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<DocumentFilters>({});
  
  const { data: documentsData, isLoading } = useGlobalDocuments({
    page: currentPage,
    pageSize: 20,
    filters,
  });

  const { data: stats } = useGlobalDocumentStats();

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

  const totalPages = documentsData ? Math.ceil(documentsData.total / documentsData.pageSize) : 0;

  return (
    <RoleGuard roles={['admin']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <GlobeAltIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('globalDocuments')}</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {t('admin.globalPageDescription')}
          </p>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('admin.totalStandards')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalDocuments}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('admin.totalSize')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(stats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('admin.processing')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.statusBreakdown?.processing || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('admin.failed')}</CardTitle>
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
                <CardTitle>{t('admin.globalComplianceStandards')}</CardTitle>
                <CardDescription>
                  {t('admin.uploadManageDescription')}
                </CardDescription>
              </div>
              <Button onClick={() => setShowUploadDialog(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                {t('uploadGlobal')}
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
                isGlobal={true}
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
                  {t('admin.previous')}
                </Button>
                <span className="flex items-center px-4 text-sm">
                  {t('admin.pageOf', { page: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage >= totalPages}
                >
                  {t('admin.next')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t('uploadGlobal')}</DialogTitle>
              <DialogDescription>
                {t('admin.uploadGlobalDescription')}
              </DialogDescription>
            </DialogHeader>
            <DocumentUpload 
              isGlobal={true} 
              onSuccess={handleUploadSuccess} 
            />
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}