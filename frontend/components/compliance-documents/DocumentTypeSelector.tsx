'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { 
  DocumentType,
  complianceDocumentsAPI 
} from '@/lib/api/compliance-documents';

interface DocumentTypeSelectorProps {
  selectedTypes: DocumentType[];
  onSelectionChange: (types: DocumentType[]) => void;
  disabled?: boolean;
  securityLevel?: string;
}

const DOCUMENT_TYPES = [
  DocumentType.COMPLIANCE_DECLARATION,
  DocumentType.SELF_ASSESSMENT_REPORT,
  DocumentType.INTERNAL_RECORD,
  DocumentType.EVALUATION_REPORT,
  DocumentType.ACTION_PLAN,
];

export function DocumentTypeSelector({
  selectedTypes,
  onSelectionChange,
  disabled = false,
  securityLevel,
}: DocumentTypeSelectorProps) {
  const t = useTranslations('ComplianceDocuments');

  const handleToggle = (type: DocumentType) => {
    if (selectedTypes.includes(type)) {
      onSelectionChange(selectedTypes.filter(t => t !== type));
    } else {
      onSelectionChange([...selectedTypes, type]);
    }
  };

  const handleSelectAll = () => {
    if (selectedTypes.length === DOCUMENT_TYPES.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...DOCUMENT_TYPES]);
    }
  };

  const getDocumentDescription = (type: DocumentType): string => {
    const descriptions = {
      [DocumentType.COMPLIANCE_DECLARATION]: t('descriptions.complianceDeclaration'),
      [DocumentType.SELF_ASSESSMENT_REPORT]: t('descriptions.selfAssessmentReport'),
      [DocumentType.INTERNAL_RECORD]: t('descriptions.internalRecord'),
      [DocumentType.EVALUATION_REPORT]: t('descriptions.evaluationReport'),
      [DocumentType.ACTION_PLAN]: t('descriptions.actionPlan'),
    };
    return descriptions[type] || '';
  };

  const isRecommended = (type: DocumentType): boolean => {
    // Recommend certain documents based on security level
    if (securityLevel === 'napredna') {
      return true; // All documents recommended for advanced level
    }
    if (securityLevel === 'srednja') {
      return [
        DocumentType.COMPLIANCE_DECLARATION,
        DocumentType.SELF_ASSESSMENT_REPORT,
        DocumentType.ACTION_PLAN,
      ].includes(type);
    }
    // Basic level
    return [
      DocumentType.COMPLIANCE_DECLARATION,
      DocumentType.SELF_ASSESSMENT_REPORT,
    ].includes(type);
  };

  return (
    <div className="space-y-4">
      {/* Select All Toggle */}
      <div className="flex items-center justify-between pb-2 border-b">
        <label className="label cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-primary mr-3"
            checked={selectedTypes.length === DOCUMENT_TYPES.length}
            onChange={handleSelectAll}
            disabled={disabled}
          />
          <span className="label-text font-medium">{t('selectAll')}</span>
        </label>
        <span className="text-sm text-base-content/60">
          {t('selectedCount', { count: selectedTypes.length })}
        </span>
      </div>

      {/* Document Type List */}
      <div className="space-y-3">
        {DOCUMENT_TYPES.map((type) => (
          <div
            key={type}
            className={`p-4 rounded-lg border transition-colors ${
              selectedTypes.includes(type)
                ? 'border-primary bg-primary/5'
                : 'border-base-300 hover:border-base-content/20'
            } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
            onClick={() => !disabled && handleToggle(type)}
          >
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary mt-1"
                checked={selectedTypes.includes(type)}
                onChange={() => handleToggle(type)}
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">
                    {complianceDocumentsAPI.getDocumentTypeIcon(type)}
                  </span>
                  <h4 className="font-medium">
                    {complianceDocumentsAPI.getDocumentTypeDisplayName(type)}
                  </h4>
                  {isRecommended(type) && (
                    <span className="badge badge-primary badge-sm">
                      {t('recommended')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-base-content/70 mt-1">
                  {getDocumentDescription(type)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}