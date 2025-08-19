/**
 * Document upload component with drag and drop
 */

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useDropzone } from 'react-dropzone';
import { DocumentArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUploadDocument, useUploadGlobalDocument } from '@/hooks/api/use-documents';
import type { DocumentType, DocumentSource } from '@/types/document';

interface DocumentUploadProps {
  isGlobal?: boolean;
  onSuccess?: () => void;
  className?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

export function DocumentUpload({ 
  isGlobal = false, 
  onSuccess,
  className 
}: DocumentUploadProps) {
  const t = useTranslations('documents');
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('other');
  const [source, setSource] = useState<DocumentSource>('other');
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadDocument = useUploadDocument();
  const uploadGlobalDocument = useUploadGlobalDocument();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (!title) {
        // Auto-fill title from filename if empty
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!acceptedFiles[0] || !title) return;

    try {
      setUploadProgress(10);
      
      if (isGlobal) {
        await uploadGlobalDocument.mutateAsync({
          file: acceptedFiles[0],
          title,
          documentType,
          source,
        });
      } else {
        await uploadDocument.mutateAsync({
          file: acceptedFiles[0],
          title,
        });
      }

      setUploadProgress(100);
      onSuccess?.();
      
      // Reset form
      setTitle('');
      setDocumentType('other');
      setSource('other');
      acceptedFiles.splice(0);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploadProgress(0);
    }
  };

  const removeFile = () => {
    acceptedFiles.splice(0);
  };

  const isUploading = uploadDocument.isPending || uploadGlobalDocument.isPending;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-700',
          isUploading && 'pointer-events-none opacity-50'
        )}
      >
        <input {...getInputProps()} />
        
        {acceptedFiles.length === 0 ? (
          <>
            <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('dragDrop')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              PDF, DOCX, TXT (max 50MB)
            </p>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DocumentArrowUpIcon className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium">{acceptedFiles[0].name}</p>
                <p className="text-xs text-gray-500">
                  {(acceptedFiles[0].size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            {!isUploading && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-b-lg overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* File rejection errors */}
      {fileRejections.length > 0 && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {fileRejections[0].errors.map((error) => (
            <p key={error.code}>{error.message}</p>
          ))}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="title">{t('documentTitle')}</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('enterTitle')}
            disabled={isUploading}
          />
        </div>

        {isGlobal && (
          <>
            <div>
              <Label htmlFor="documentType">{t('documentType.label')}</Label>
              <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentType)}>
                <SelectTrigger id="documentType" disabled={isUploading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{t('documentType.standard')}</SelectItem>
                  <SelectItem value="regulation">{t('documentType.regulation')}</SelectItem>
                  <SelectItem value="guideline">{t('documentType.guideline')}</SelectItem>
                  <SelectItem value="policy">{t('documentType.policy')}</SelectItem>
                  <SelectItem value="procedure">{t('documentType.procedure')}</SelectItem>
                  <SelectItem value="best_practice">{t('documentType.bestPractice')}</SelectItem>
                  <SelectItem value="other">{t('documentType.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="source">{t('source.label')}</Label>
              <Select value={source} onValueChange={(value) => setSource(value as DocumentSource)}>
                <SelectTrigger id="source" disabled={isUploading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ISO">{t('source.iso')}</SelectItem>
                  <SelectItem value="NIST">{t('source.nist')}</SelectItem>
                  <SelectItem value="ZKS">{t('source.zks')}</SelectItem>
                  <SelectItem value="NIS2">{t('source.nis2')}</SelectItem>
                  <SelectItem value="other">{t('source.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Upload button */}
      <Button
        onClick={handleUpload}
        disabled={!acceptedFiles[0] || !title || isUploading}
        className="w-full"
      >
        {isUploading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
            {t('processing')}
          </>
        ) : (
          <>
            <DocumentArrowUpIcon className="h-5 w-5 mr-2" />
            {isGlobal ? t('uploadGlobal') : t('upload')}
          </>
        )}
      </Button>
    </div>
  );
}