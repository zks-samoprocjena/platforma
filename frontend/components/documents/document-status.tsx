/**
 * Document status badge component
 */

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { DocumentStatus } from '@/types/document';

interface DocumentStatusBadgeProps {
  status: DocumentStatus;
  showSpinner?: boolean;
  className?: string;
}

export function DocumentStatusBadge({ 
  status, 
  showSpinner = true,
  className 
}: DocumentStatusBadgeProps) {
  const t = useTranslations('documents.status');

  const statusConfig = {
    pending: {
      label: t('pending'),
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      dotClassName: 'bg-gray-400',
    },
    processing: {
      label: t('processing'),
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      dotClassName: 'bg-blue-500',
    },
    completed: {
      label: t('completed'),
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      dotClassName: 'bg-green-500',
    },
    failed: {
      label: t('failed'),
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      dotClassName: 'bg-red-500',
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.className,
        className
      )}
    >
      {status === 'processing' && showSpinner ? (
        <svg
          className="animate-spin h-3 w-3 text-current"
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
      ) : (
        <span className={cn('w-2 h-2 rounded-full', config.dotClassName)} />
      )}
      {config.label}
    </span>
  );
}