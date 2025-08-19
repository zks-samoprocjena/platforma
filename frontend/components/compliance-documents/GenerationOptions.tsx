'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { DocumentTypeCapabilities } from '@/lib/api/compliance-documents';

interface GenerationOptionsProps {
  options: {
    include_ai_analysis: boolean;
    language: 'hr' | 'en';
    include_recommendations: boolean;
    include_roadmap: boolean;
  };
  onOptionsChange: (options: {
    include_ai_analysis: boolean;
    language: 'hr' | 'en';
    include_recommendations: boolean;
    include_roadmap: boolean;
  }) => void;
  capabilities?: DocumentTypeCapabilities;
  disabled?: boolean;
}

export function GenerationOptions({
  options,
  onOptionsChange,
  capabilities,
  disabled = false,
}: GenerationOptionsProps) {
  const t = useTranslations('ComplianceDocuments');
  
  // Default to showing all options if no capabilities provided
  const showAIAnalysis = capabilities?.supportsAIAnalysis ?? true;
  const showRecommendations = capabilities?.supportsRecommendations ?? true;
  const showRoadmap = capabilities?.supportsRoadmap ?? true;

  const handleToggle = (key: keyof typeof options) => {
    if (key === 'language') {
      // Language is handled separately, so skip boolean toggle
      return;
    }
    
    onOptionsChange({
      ...options,
      [key]: !options[key],
    });
  };

  const handleLanguageChange = (language: 'hr' | 'en') => {
    onOptionsChange({
      ...options,
      language,
    });
  };

  return (
    <div className="space-y-4">
      {/* Language Selection */}
      <div className="form-control">
        <label className="label">
          <span className="label-text font-medium">{t('options.language')}</span>
        </label>
        <div className="flex space-x-4">
          <label className="label cursor-pointer">
            <input
              type="radio"
              name="language"
              className="radio radio-primary"
              checked={options.language === 'hr'}
              onChange={() => handleLanguageChange('hr')}
              disabled={disabled}
            />
            <span className="label-text ml-2">Hrvatski</span>
          </label>
          <label className="label cursor-pointer">
            <input
              type="radio"
              name="language"
              className="radio radio-primary"
              checked={options.language === 'en'}
              onChange={() => handleLanguageChange('en')}
              disabled={disabled}
            />
            <span className="label-text ml-2">English</span>
          </label>
        </div>
      </div>

      {/* AI Analysis Toggle */}
      {showAIAnalysis && (
        <div className="form-control">
          <label className="label cursor-pointer justify-between">
            <div>
              <span className="label-text font-medium">{t('options.aiAnalysis')}</span>
              <p className="text-sm text-base-content/60 mt-1">
                {t('options.aiAnalysisDescription')}
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={options.include_ai_analysis}
              onChange={() => handleToggle('include_ai_analysis')}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      {/* Recommendations Toggle */}
      {showRecommendations && (
        <div className="form-control">
          <label className="label cursor-pointer justify-between">
            <div>
              <span className="label-text font-medium">{t('options.recommendations')}</span>
              <p className="text-sm text-base-content/60 mt-1">
                {t('options.recommendationsDescription')}
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={options.include_recommendations}
              onChange={() => handleToggle('include_recommendations')}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      {/* Roadmap Toggle */}
      {showRoadmap && (
        <div className="form-control">
          <label className="label cursor-pointer justify-between">
            <div>
              <span className="label-text font-medium">{t('options.roadmap')}</span>
              <p className="text-sm text-base-content/60 mt-1">
                {t('options.roadmapDescription')}
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={options.include_roadmap}
              onChange={() => handleToggle('include_roadmap')}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      {/* No AI Features Available Info */}
      {!showAIAnalysis && !showRecommendations && !showRoadmap && (
        <div className="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>{t('options.noAIFeatures')}</span>
        </div>
      )}

      {/* Info Alert */}
      {options.include_ai_analysis && showAIAnalysis && (
        <div className="alert alert-info">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="stroke-current shrink-0 w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm">{t('options.aiProcessingNote')}</span>
        </div>
      )}
    </div>
  );
}