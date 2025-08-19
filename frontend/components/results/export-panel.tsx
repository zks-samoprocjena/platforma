'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DocumentArrowDownIcon, TableCellsIcon, DocumentTextIcon, ClockIcon } from '@heroicons/react/24/outline'
import { exportToPDF, exportToExcel, generateSummaryReport } from '@/utils/export'
import { AssessmentResultsResponse, GapAnalysisItem, AIRecommendation } from '@/types/assessment'
import { transformToLegacyResults } from '@/lib/assessment-helpers'
import toast from 'react-hot-toast'

interface ExportPanelProps {
  assessmentId: string
  assessmentData: {
    id: string
    title: string
    created_at: string
    security_level: string
    organization_name: string
  }
  results: AssessmentResultsResponse
  gaps: GapAnalysisItem[]
  recommendations: AIRecommendation[]
  language: 'hr' | 'en'
}

export default function ExportPanel({
  assessmentId,
  assessmentData,
  results,
  gaps,
  recommendations,
  language
}: ExportPanelProps) {
  const t = useTranslations('results.export')
  const [isExporting, setIsExporting] = useState<string | null>(null)

  const exportData = {
    assessment: assessmentData,
    results: transformToLegacyResults(results),
    gaps,
    recommendations
  }

  const handlePDFExport = async () => {
    setIsExporting('pdf')
    try {
      await exportToPDF(exportData, language)
      toast.success(t('pdf.success'))
    } catch (error) {
      console.error('PDF export error:', error)
      toast.error(t('pdf.error'))
    } finally {
      setIsExporting(null)
    }
  }

  const handleExcelExport = async () => {
    setIsExporting('excel')
    try {
      exportToExcel(exportData, language)
      toast.success(t('excel.success'))
    } catch (error) {
      console.error('Excel export error:', error)
      toast.error(t('excel.error'))
    } finally {
      setIsExporting(null)
    }
  }

  const handleSummaryExport = async () => {
    setIsExporting('summary')
    try {
      const summaryReport = generateSummaryReport(exportData, language)
      
      // Create and download JSON summary
      const blob = new Blob([JSON.stringify(summaryReport, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `assessment-summary-${assessmentId}-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success(t('summary.success'))
    } catch (error) {
      console.error('Summary export error:', error)
      toast.error(t('summary.error'))
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <DocumentArrowDownIcon className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">
          {t('title')}
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* PDF Export */}
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <DocumentTextIcon className="w-8 h-8 text-red-500" />
            <div>
              <h3 className="font-medium text-gray-900">{t('pdf.title')}</h3>
              <p className="text-sm text-gray-600">{t('pdf.description')}</p>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-gray-600 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('pdf.features.compliance')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('pdf.features.gaps')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('pdf.features.recommendations')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('pdf.features.croatian')}
            </div>
          </div>
          
          <button
            onClick={handlePDFExport}
            disabled={isExporting === 'pdf'}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            {isExporting === 'pdf' ? (
              <>
                <ClockIcon className="w-4 h-4 animate-spin" />
                {t('generating')}
              </>
            ) : (
              <>
                <DocumentTextIcon className="w-4 h-4" />
                {t('pdf.button')}
              </>
            )}
          </button>
        </div>

        {/* Excel Export */}
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <TableCellsIcon className="w-8 h-8 text-green-500" />
            <div>
              <h3 className="font-medium text-gray-900">{t('excel.title')}</h3>
              <p className="text-sm text-gray-600">{t('excel.description')}</p>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-gray-600 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('excel.features.structured')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('excel.features.analysis')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('excel.features.filtering')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('excel.features.calculations')}
            </div>
          </div>
          
          <button
            onClick={handleExcelExport}
            disabled={isExporting === 'excel'}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            {isExporting === 'excel' ? (
              <>
                <ClockIcon className="w-4 h-4 animate-spin" />
                {t('generating')}
              </>
            ) : (
              <>
                <TableCellsIcon className="w-4 h-4" />
                {t('excel.button')}
              </>
            )}
          </button>
        </div>

        {/* Summary Export */}
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <DocumentArrowDownIcon className="w-8 h-8 text-blue-500" />
            <div>
              <h3 className="font-medium text-gray-900">{t('summary.title')}</h3>
              <p className="text-sm text-gray-600">{t('summary.description')}</p>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-gray-600 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('summary.features.executive')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('summary.features.findings')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('summary.features.actions')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {t('summary.features.json')}
            </div>
          </div>
          
          <button
            onClick={handleSummaryExport}
            disabled={isExporting === 'summary'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            {isExporting === 'summary' ? (
              <>
                <ClockIcon className="w-4 h-4 animate-spin" />
                {t('generating')}
              </>
            ) : (
              <>
                <DocumentArrowDownIcon className="w-4 h-4" />
                {t('summary.button')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Export Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">{t('info.title')}</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• {t('info.files')}</li>
          <li>• {t('info.compliance')}</li>
          <li>• {t('info.privacy')}</li>
          <li>• {t('info.format')}</li>
        </ul>
      </div>
    </div>
  )
}
