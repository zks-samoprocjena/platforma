'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAssessments } from '@/hooks/api/use-assessments'
import { AssessmentCard } from './assessment-card'
import { AssessmentStatus } from '@/types/assessment'
import { Search, Filter, Plus, ChevronLeft, ChevronRight } from 'lucide-react'

interface AssessmentListProps {
  onCreateNew: () => void
}

export function AssessmentList({ onCreateNew }: AssessmentListProps) {
  const t = useTranslations('Assessment')
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'created' | 'updated' | 'title'>('updated')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(3) // Show 3 assessments per page
  
  const { data, isLoading, error } = useAssessments({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: searchQuery || undefined,
    page: currentPage,
    per_page: itemsPerPage
  })

  const sortedAssessments = useMemo(() => {
    if (!data?.items) return []
    
    let sorted = [...data.items]
    
    // Apply sorting (backend already filtered by search)
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        case 'title':
          return a.title.localeCompare(b.title, 'hr')
        default:
          return 0
      }
    })
    
    return sorted
  }, [data?.items, sortBy])

  // Reset to page 1 when filters change
  const handleFilterChange = (newStatusFilter: AssessmentStatus | 'all') => {
    setStatusFilter(newStatusFilter)
    setCurrentPage(1)
  }

  const handleSearchChange = (newSearchQuery: string) => {
    setSearchQuery(newSearchQuery)
    setCurrentPage(1)
  }

  const handleSortChange = (newSortBy: 'created' | 'updated' | 'title') => {
    setSortBy(newSortBy)
    setCurrentPage(1)
  }

  // Pagination calculations
  const totalPages = data ? Math.ceil(data.total / itemsPerPage) : 0
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1

  const handlePrevPage = () => {
    if (hasPrevPage) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (hasNextPage) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePageClick = (page: number) => {
    setCurrentPage(page)
  }

  // Generate page numbers for pagination
  const generatePageNumbers = () => {
    const pages = []
    const maxVisible = 5
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show smart pagination with ellipsis
      if (currentPage <= 3) {
        // Near beginning
        for (let i = 1; i <= 4; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        // Near end
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        // In middle
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-error">{t('errors.loadingFailed')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50 h-5 w-5" />
            <input
              type="text"
              placeholder={t('search.placeholder')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="input input-bordered w-full pl-10"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div className="dropdown">
          <label tabIndex={0} className="btn btn-outline gap-2">
            <Filter className="h-5 w-5" />
            {statusFilter === 'all' ? t('status.all') : t(`status.${statusFilter}`)}
          </label>
          <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
            <li><a onClick={() => handleFilterChange('all')}>{t('status.all')}</a></li>
            <li><a onClick={() => handleFilterChange('draft')}>{t('status.draft')}</a></li>
            <li><a onClick={() => handleFilterChange('in_progress')}>{t('status.in_progress')}</a></li>
            <li><a onClick={() => handleFilterChange('review')}>{t('status.review')}</a></li>
            <li><a onClick={() => handleFilterChange('completed')}>{t('status.completed')}</a></li>
          </ul>
        </div>

        {/* Sort */}
        <select 
          className="select select-bordered"
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
        >
          <option value="updated">{t('sort.updated')}</option>
          <option value="created">{t('sort.created')}</option>
          <option value="title">{t('sort.title')}</option>
        </select>

        {/* Create New Button */}
        <button onClick={onCreateNew} className="btn btn-primary gap-2">
          <Plus className="h-5 w-5" />
          {t('actions.createNew')}
        </button>
      </div>

      {/* Results Summary */}
      {data && !isLoading && (
        <div className="flex justify-between items-center text-sm text-base-content/70">
          <span>
            {data.total === 0 
              ? 'Nema rezultata'
              : `Ukupno ${data.total} ${data.total === 1 ? 'samoprocjena' : 'samoprocjena'}`
            }
          </span>
          {data.total > 0 && (
            <span>
              Stranica {currentPage} od {totalPages}
            </span>
          )}
        </div>
      )}

      {/* Assessment List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(itemsPerPage)].map((_, i) => (
            <div key={i} className="skeleton h-48 w-full"></div>
          ))}
        </div>
      ) : sortedAssessments.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-base-content/50 mb-4">
            {searchQuery || statusFilter !== 'all' 
              ? t('empty.noResults') 
              : t('empty.noAssessments')}
          </div>
          {(!searchQuery && statusFilter === 'all') && (
            <button onClick={onCreateNew} className="btn btn-primary">
              {t('actions.createFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedAssessments.map((assessment) => (
            <AssessmentCard key={assessment.id} assessment={assessment} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > itemsPerPage && (
        <div className="flex justify-center mt-8">
          <div className="join">
            {/* Previous button */}
            <button 
              className="join-item btn"
              disabled={!hasPrevPage}
              onClick={handlePrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
              {t('actions.previous')}
            </button>
            
            {/* Page numbers */}
            {generatePageNumbers().map((page, index) => (
              page === '...' ? (
                <button key={`ellipsis-${index}`} className="join-item btn btn-disabled">
                  ...
                </button>
              ) : (
                <button
                  key={page}
                  className={`join-item btn ${currentPage === page ? 'btn-active' : ''}`}
                  onClick={() => handlePageClick(page as number)}
                >
                  {page}
                </button>
              )
            ))}
            
            {/* Next button */}
            <button 
              className="join-item btn"
              disabled={!hasNextPage}
              onClick={handleNextPage}
            >
              {t('actions.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}