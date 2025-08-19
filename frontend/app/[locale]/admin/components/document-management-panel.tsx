'use client';

import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { AdminDocumentsClient } from '../documents/admin-documents-client';

export function DocumentManagementPanel() {
  const t = useTranslations('admin');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold">{t('globalDocuments')}</h2>
          <p className="text-gray-600">{t('manageGlobalDocuments')}</p>
        </div>
      </div>

      {/* Existing Document Management */}
      <AdminDocumentsClient />
    </div>
  );
} 