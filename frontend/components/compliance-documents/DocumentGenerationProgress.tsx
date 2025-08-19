'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { 
  DocumentGenerationJob,
  complianceDocumentsAPI 
} from '@/lib/api/compliance-documents';

interface DocumentGenerationProgressProps {
  job: DocumentGenerationJob;
  onCancel?: () => void;
}

export function DocumentGenerationProgress({
  job,
  onCancel,
}: DocumentGenerationProgressProps) {
  const t = useTranslations('ComplianceDocuments');
  
  const getStatusColor = () => {
    switch (job.status) {
      case 'completed':
        return 'text-success';
      case 'failed':
        return 'text-error';
      case 'processing':
        return 'text-info';
      default:
        return 'text-base-content';
    }
  };

  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'processing':
        return '⟳';
      default:
        return '○';
    }
  };

  const getProgressPercentage = () => {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed') return 0;
    return job.progress || 30; // Default to 30% if processing
  };

  return (
    <div className="flex items-center space-x-4 p-4 bg-base-200 rounded-lg">
      {/* Document Icon and Name */}
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">
            {complianceDocumentsAPI.getDocumentTypeIcon(job.document_type)}
          </span>
          <div>
            <h4 className="font-medium">
              {complianceDocumentsAPI.getDocumentTypeDisplayName(job.document_type)}
            </h4>
            <p className={`text-sm ${getStatusColor()}`}>
              <span className="mr-1">{getStatusIcon()}</span>
              {t(`status.${job.status}`)}
              {job.error_message && (
                <span className="ml-2 text-error">({job.error_message})</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex-1 max-w-xs">
        <div className="w-full bg-base-300 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              job.status === 'completed'
                ? 'bg-success'
                : job.status === 'failed'
                ? 'bg-error'
                : 'bg-primary'
            }`}
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2">
        {job.status === 'processing' && onCancel && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            title={t('actions.cancel')}
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
        
        {job.status === 'completed' && job.result_url && (
          <a
            href={job.result_url}
            download
            className="btn btn-primary btn-sm"
            title={t('actions.download')}
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
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
              />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}