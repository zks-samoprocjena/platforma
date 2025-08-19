'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'react-hot-toast';
import { 
  DocumentType, 
  complianceDocumentsAPI,
  DocumentGenerationJob 
} from '@/lib/api/compliance-documents';
import { DocumentGenerationProgress } from './DocumentGenerationProgress';
import { DocumentTypeSelector } from './DocumentTypeSelector';
import { GenerationOptions } from './GenerationOptions';
import { GeneratedDocumentsList } from './GeneratedDocumentsList';

interface DocumentGenerationPanelProps {
  assessmentId: string;
  securityLevel: string;
  onDocumentGenerated?: () => void;
}

export function DocumentGenerationPanel({
  assessmentId,
  securityLevel,
  onDocumentGenerated,
}: DocumentGenerationPanelProps) {
  const t = useTranslations('ComplianceDocuments');
  const [selectedTypes, setSelectedTypes] = useState<DocumentType[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJobs, setActiveJobs] = useState<Map<string, DocumentGenerationJob>>(new Map());
  const [shouldRefresh, setShouldRefresh] = useState(false);
  const [options, setOptions] = useState({
    include_ai_analysis: true,
    language: 'hr' as 'hr' | 'en',
    include_recommendations: true,
    include_roadmap: true,
  });
  
  // Get combined capabilities for selected document types
  const capabilities = complianceDocumentsAPI.getCombinedCapabilities(selectedTypes);
  
  // Reset unavailable options when document types change
  React.useEffect(() => {
    setOptions(prev => ({
      ...prev,
      include_ai_analysis: capabilities.supportsAIAnalysis ? prev.include_ai_analysis : false,
      include_recommendations: capabilities.supportsRecommendations ? prev.include_recommendations : false,
      include_roadmap: capabilities.supportsRoadmap ? prev.include_roadmap : false,
    }));
  }, [capabilities.supportsAIAnalysis, capabilities.supportsRecommendations, capabilities.supportsRoadmap]);

  // Handle refresh trigger with delay when all jobs complete
  React.useEffect(() => {
    if (activeJobs.size === 0 && shouldRefresh) {
      // Add a delay to ensure backend has finished updating file sizes
      const timer = setTimeout(() => {
        setShouldRefresh(false);
      }, 1500); // 1.5 second delay
      
      return () => clearTimeout(timer);
    }
  }, [activeJobs.size, shouldRefresh]);

  const handleGenerateDocuments = useCallback(async () => {
    if (selectedTypes.length === 0) {
      toast.error(t('errors.noDocumentsSelected'));
      return;
    }

    setIsGenerating(true);
    const jobs = new Map(activeJobs);

    try {
      if (selectedTypes.length === 1) {
        // Single document generation
        const result = await complianceDocumentsAPI.generateDocument(
          selectedTypes[0],
          { assessment_id: assessmentId, options }
        );
        
        jobs.set(result.document_id, {
          id: result.job_id,
          document_id: result.document_id,
          document_type: selectedTypes[0],
          status: 'processing',
          created_at: new Date().toISOString(),
        });
      } else {
        // Batch generation
        const result = await complianceDocumentsAPI.generateBatch({
          assessment_id: assessmentId,
          document_types: selectedTypes,
          options,
        });
        
        result.jobs.forEach(job => {
          jobs.set(job.document_id, {
            id: job.job_id,
            document_id: job.document_id,
            document_type: job.document_type,
            status: 'processing',
            created_at: new Date().toISOString(),
          });
        });
      }

      setActiveJobs(jobs);
      toast.success(t('generation.started'));

      // Poll for completion
      const pollPromises = Array.from(jobs.entries()).map(async ([docId, job]) => {
        try {
          const completed = await complianceDocumentsAPI.waitForCompletion(docId, {
            onProgress: (updatedJob) => {
              setActiveJobs(prev => {
                const updated = new Map(prev);
                updated.set(docId, updatedJob);
                return updated;
              });
            },
          });

          if (completed.status === 'completed') {
            toast.success(
              t('generation.completed', {
                document: complianceDocumentsAPI.getDocumentTypeDisplayName(job.document_type),
              })
            );
          } else if (completed.status === 'failed') {
            toast.error(
              t('generation.failed', {
                document: complianceDocumentsAPI.getDocumentTypeDisplayName(job.document_type),
                error: completed.error_message,
              })
            );
          }
        } catch (error) {
          console.error('Document generation error:', error);
          toast.error(t('errors.generationTimeout'));
        }
      });

      await Promise.all(pollPromises);
      
      // Trigger refresh with delay
      setShouldRefresh(true);
      
      if (onDocumentGenerated) {
        onDocumentGenerated();
      }
    } catch (error) {
      console.error('Failed to generate documents:', error);
      toast.error(t('errors.generationFailed'));
    } finally {
      setIsGenerating(false);
      setSelectedTypes([]);
    }
  }, [selectedTypes, assessmentId, options, activeJobs, t, onDocumentGenerated]);

  const handleCancelJob = useCallback(async (documentId: string) => {
    // In a real implementation, we would call an API to cancel the job
    setActiveJobs(prev => {
      const updated = new Map(prev);
      updated.delete(documentId);
      return updated;
    });
    toast.info(t('generation.cancelled'));
  }, [t]);

  return (
    <div className="space-y-6">
      {/* Document Type Selection */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h3 className="card-title text-lg">{t('selectDocuments')}</h3>
          <DocumentTypeSelector
            selectedTypes={selectedTypes}
            onSelectionChange={setSelectedTypes}
            disabled={isGenerating}
            securityLevel={securityLevel}
          />
        </div>
      </div>

      {/* Generation Options */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h3 className="card-title text-lg">{t('generationOptions')}</h3>
          <GenerationOptions
            options={options}
            onOptionsChange={setOptions}
            capabilities={capabilities}
            disabled={isGenerating}
          />
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex justify-end">
        <button
          className={`btn btn-primary ${isGenerating ? 'loading' : ''}`}
          onClick={handleGenerateDocuments}
          disabled={isGenerating || selectedTypes.length === 0}
        >
          {isGenerating ? t('generating') : t('generateDocuments')}
        </button>
      </div>

      {/* Active Jobs Progress */}
      {activeJobs.size > 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h3 className="card-title text-lg">{t('generationProgress')}</h3>
            <div className="space-y-4">
              {Array.from(activeJobs.entries()).map(([docId, job]) => (
                <DocumentGenerationProgress
                  key={docId}
                  job={job}
                  onCancel={() => handleCancelJob(docId)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Generated Documents List */}
      <GeneratedDocumentsList
        assessmentId={assessmentId}
        refreshTrigger={activeJobs.size === 0 && !shouldRefresh}
      />
    </div>
  );
}