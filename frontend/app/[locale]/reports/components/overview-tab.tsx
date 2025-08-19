'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAssessments } from '@/hooks/api/use-assessments'
import { Assessment, AssessmentStatus, SecurityLevel } from '@/types/assessment'
import { 
  FileText, 
  Download, 
  Filter, 
  Search, 
  Calendar,
  BarChart3,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Building2,
  RefreshCw
} from 'lucide-react'
import Link from 'next/link'

type FilterCriteria = {
  status: AssessmentStatus | 'all'
  securityLevel: SecurityLevel | 'all'
  dateRange: '7d' | '30d' | '90d' | '1y' | 'all'
  search: string
}

export function OverviewTab() {
  const t = useTranslations()
  const tReports = useTranslations('Reports')
  const { data: assessments, isLoading, refetch } = useAssessments()
  
  const [filters, setFilters] = useState<FilterCriteria>({
    status: 'all',
    securityLevel: 'all',
    dateRange: '30d',
    search: ''
  })

  const [selectedAssessments, setSelectedAssessments] = useState<string[]>([])

  // Filter and search assessments
  const filteredAssessments = useMemo(() => {
    if (!assessments?.items) return []

    return assessments.items.filter(assessment => {
      // Status filter
      if (filters.status !== 'all' && assessment.status !== filters.status) {
        return false
      }

      // Security level filter
      if (filters.securityLevel !== 'all' && assessment.security_level !== filters.securityLevel) {
        return false
      }

      // Date range filter
      if (filters.dateRange !== 'all') {
        const now = new Date()
        const assessmentDate = new Date(assessment.updated_at)
        const daysDiff = Math.floor((now.getTime() - assessmentDate.getTime()) / (1000 * 3600 * 24))

        switch (filters.dateRange) {
          case '7d':
            if (daysDiff > 7) return false
            break
          case '30d':
            if (daysDiff > 30) return false
            break
          case '90d':
            if (daysDiff > 90) return false
            break
          case '1y':
            if (daysDiff > 365) return false
            break
        }
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        return (
          assessment.title.toLowerCase().includes(searchLower) ||
          (assessment.description?.toLowerCase().includes(searchLower)) ||
          assessment.id.toLowerCase().includes(searchLower)
        )
      }

      return true
    })
  }, [assessments, filters])

  // Calculate statistics
  const stats = useMemo(() => {
    if (!assessments?.items) return null

    const items = assessments.items
    const total = items.length
    const completed = items.filter(a => a.status === 'completed').length
    const inProgress = items.filter(a => a.status === 'in_progress').length
    const drafts = items.filter(a => a.status === 'draft').length

    // Calculate average compliance (mock data for now)
    const completedAssessments = items.filter(a => a.status === 'completed')
    const avgCompliance = completedAssessments.length > 0 
      ? Math.round(completedAssessments.reduce((acc, _) => acc + Math.random() * 40 + 60, 0) / completedAssessments.length)
      : 0

    return {
      total,
      completed,
      inProgress,
      drafts,
      avgCompliance
    }
  }, [assessments])

  const getStatusIcon = (status: AssessmentStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />
      case 'in_progress':
        return <Clock className="h-4 w-4 text-warning" />
      case 'review':
        return <AlertTriangle className="h-4 w-4 text-info" />
      case 'draft':
        return <FileText className="h-4 w-4 text-neutral" />
      default:
        return <FileText className="h-4 w-4 text-neutral" />
    }
  }

  const getSecurityLevelIcon = (level: SecurityLevel) => {
    switch (level) {
      case 'osnovna':
        return <Shield className="h-4 w-4 text-success" />
      case 'srednja':
        return <AlertTriangle className="h-4 w-4 text-warning" />
      case 'napredna':
        return <CheckCircle className="h-4 w-4 text-error" />
    }
  }

  const handleExportSelected = () => {
    if (selectedAssessments.length === 0) return
    
    // TODO: Implement actual export functionality
    console.log('Exporting assessments:', selectedAssessments)
    // For now, just show a toast or modal
  }

  const handleSelectAll = () => {
    if (selectedAssessments.length === filteredAssessments.length) {
      setSelectedAssessments([])
    } else {
      setSelectedAssessments(filteredAssessments.map(a => a.id))
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('hr-HR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading loading-spinner loading-lg text-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="assessment-card p-4">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-primary mr-3" />
              <div>
                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                <div className="text-sm text-base-content/70">{tReports('statistics.total')}</div>
              </div>
            </div>
          </div>
          
          <div className="assessment-card p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-success mr-3" />
              <div>
                <div className="text-2xl font-bold text-success">{stats.completed}</div>
                <div className="text-sm text-base-content/70">{tReports('statistics.completed')}</div>
              </div>
            </div>
          </div>
          
          <div className="assessment-card p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-warning mr-3" />
              <div>
                <div className="text-2xl font-bold text-warning">{stats.inProgress}</div>
                <div className="text-sm text-base-content/70">{tReports('statistics.inProgress')}</div>
              </div>
            </div>
          </div>
          
          <div className="assessment-card p-4">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-neutral mr-3" />
              <div>
                <div className="text-2xl font-bold text-neutral">{stats.drafts}</div>
                <div className="text-sm text-base-content/70">{tReports('statistics.drafts')}</div>
              </div>
            </div>
          </div>
          
          <div className="assessment-card p-4">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-info mr-3" />
              <div>
                <div className="text-2xl font-bold text-info">{stats.avgCompliance}%</div>
                <div className="text-sm text-base-content/70">{tReports('statistics.avgCompliance')}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="assessment-card">
        <div className="flex items-center mb-4">
          <Filter className="h-5 w-5 text-primary mr-2" />
          <h2 className="text-xl font-semibold">{tReports('filters.title')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{tReports('filters.search.label')}</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="form-input pl-10"
                placeholder={tReports('filters.search.placeholder')}
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{tReports('filters.status.label')}</span>
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as AssessmentStatus | 'all' }))}
              className="select select-bordered w-full"
            >
              <option value="all">{tReports('filters.status.options.all')}</option>
              <option value="draft">{tReports('filters.status.options.draft')}</option>
              <option value="in_progress">{tReports('filters.status.options.in_progress')}</option>
              <option value="review">{tReports('filters.status.options.review')}</option>
              <option value="completed">{tReports('filters.status.options.completed')}</option>
            </select>
          </div>

          {/* Security Level Filter */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{tReports('filters.securityLevel.label')}</span>
            </label>
            <select
              value={filters.securityLevel}
              onChange={(e) => setFilters(prev => ({ ...prev, securityLevel: e.target.value as SecurityLevel | 'all' }))}
              className="select select-bordered w-full"
            >
              <option value="all">{tReports('filters.securityLevel.options.all')}</option>
              <option value="osnovna">{tReports('filters.securityLevel.options.osnovna')}</option>
              <option value="srednja">{tReports('filters.securityLevel.options.srednja')}</option>
              <option value="napredna">{tReports('filters.securityLevel.options.napredna')}</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">{tReports('filters.dateRange.label')}</span>
            </label>
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as FilterCriteria['dateRange'] }))}
              className="select select-bordered w-full"
            >
              <option value="7d">{tReports('filters.dateRange.options.7d')}</option>
              <option value="30d">{tReports('filters.dateRange.options.30d')}</option>
              <option value="90d">{tReports('filters.dateRange.options.90d')}</option>
              <option value="1y">{tReports('filters.dateRange.options.1y')}</option>
              <option value="all">{tReports('filters.dateRange.options.all')}</option>
            </select>
          </div>
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSelectAll}
            className="btn btn-outline btn-sm"
          >
            {selectedAssessments.length === filteredAssessments.length ? tReports('actions.unselectAll') : tReports('actions.selectAll')}
          </button>
          
          {selectedAssessments.length > 0 && (
            <button
              onClick={handleExportSelected}
              className="btn btn-primary btn-sm"
            >
              <Download className="h-4 w-4 mr-2" />
              {tReports('actions.exportSelected', { count: selectedAssessments.length })}
            </button>
          )}

          <div className="ml-auto text-sm text-base-content/70 flex items-center">
            {tReports('actions.resultsCount', { 
              filtered: filteredAssessments.length, 
              total: assessments?.items?.length || 0 
            })}
          </div>
        </div>
      </div>

      {/* Assessment List */}
      <div className="assessment-card">
        <div className="flex items-center mb-6">
          <BarChart3 className="h-5 w-5 text-primary mr-2" />
          <h2 className="text-xl font-semibold">{tReports('assessmentList.title')}</h2>
        </div>

        {filteredAssessments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-base-content/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-base-content/70 mb-2">
              {tReports('emptyState.noAssessments')}
            </h3>
            <p className="text-base-content/50 mb-4">
              {filters.search || filters.status !== 'all' || filters.securityLevel !== 'all' || filters.dateRange !== 'all'
                ? tReports('emptyState.filtered')
                : tReports('emptyState.none')
              }
            </p>
            {(!assessments?.items || assessments.items.length === 0) && (
              <Link href="/hr/assessments/new" className="btn btn-primary">
                {tReports('emptyState.createFirst')}
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedAssessments.length === filteredAssessments.length && filteredAssessments.length > 0}
                      onChange={handleSelectAll}
                      className="checkbox checkbox-primary"
                    />
                  </th>
                  <th>{tReports('assessmentList.table.name')}</th>
                  <th>{tReports('assessmentList.table.status')}</th>
                  <th>{tReports('assessmentList.table.securityLevel')}</th>
                  <th>{tReports('assessmentList.table.lastUpdate')}</th>
                  <th>{tReports('assessmentList.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.map((assessment) => (
                  <tr key={assessment.id} className="hover:bg-base-200/50">
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedAssessments.includes(assessment.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAssessments(prev => [...prev, assessment.id])
                          } else {
                            setSelectedAssessments(prev => prev.filter(id => id !== assessment.id))
                          }
                        }}
                        className="checkbox checkbox-primary"
                      />
                    </td>
                    <td>
                      <div>
                        <div className="font-medium text-base-content">
                          {assessment.title}
                        </div>
                        {assessment.description && (
                          <div className="text-sm text-base-content/70 truncate max-w-xs">
                            {assessment.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center">
                        {getStatusIcon(assessment.status)}
                        <span className="ml-2 capitalize">
                          {t(`Assessment.status.${assessment.status}`)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center">
                        {getSecurityLevelIcon(assessment.security_level)}
                        <span className="ml-2">
                          {t(`Assessment.securityLevel.${assessment.security_level}`)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm">
                        {formatDate(assessment.updated_at)}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Link
                          href={`/hr/assessments/${assessment.id}/${assessment.status === 'completed' ? 'results' : 'questionnaire'}`}
                          className="btn btn-ghost btn-xs"
                        >
                          {assessment.status === 'completed' ? tReports('assessmentList.buttons.results') : tReports('assessmentList.buttons.open')}
                        </Link>
                        {assessment.status === 'completed' && (
                          <Link
                            href={`/hr/assessments/${assessment.id}/results`}
                            className="btn btn-primary btn-xs"
                          >
                            {tReports('assessmentList.buttons.results')}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}