'use client'

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AssessmentResultsResponse, AIRecommendation } from '@/types/assessment'
import { useProgressiveAIRecommendations, aiKeys } from '@/hooks/api/use-ai'
import LoadingSpinner from '@/components/ui/loading-spinner'
import { notify } from '@/utils/notifications'
import { 
  LightBulbIcon, 
  DocumentTextIcon, 
  ClockIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  FunnelIcon,
  ArrowsUpDownIcon
} from '@heroicons/react/24/outline'

interface RecommendationsPanelProps {
  assessmentId: string
  organizationId: string
  results: AssessmentResultsResponse
}

export default function RecommendationsPanel({ assessmentId, organizationId, results }: RecommendationsPanelProps) {
  const t = useTranslations('results.recommendations')
  const queryClient = useQueryClient()
  const [implementedItems, setImplementedItems] = useState<Set<string>>(new Set())
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set())

  const { 
    recommendations, 
    isLoading,
    isLoadingMore,
    isPolling,
    hasMore,
    generateMore,
    regenerateRecommendation,
    metadata,
    error,
    refetch,
    filters,
    setFilters,
    sortBy,
    setSortBy
  } = useProgressiveAIRecommendations(assessmentId, organizationId)

  console.log('[RecommendationsPanel] Component state:', {
    assessmentId,
    organizationId,
    recommendationsCount: recommendations?.length || 0,
    isLoading,
    hasError: !!error,
    timestamp: new Date().toISOString()
  })

  useEffect(() => {
    // Load implemented recommendations from localStorage
    const stored = localStorage.getItem(`implemented_recommendations_${assessmentId}`)
    if (stored) {
      setImplementedItems(new Set(JSON.parse(stored)))
    }
  }, [assessmentId])

  useEffect(() => {
    console.log('[RecommendationsPanel] Recommendations data changed:', {
      count: recommendations?.length || 0,
      isLoading,
      hasError: !!error,
      recommendationIds: recommendations?.map(r => r.id) || [],
      timestamp: new Date().toISOString()
    })
  }, [recommendations, isLoading, error])

  const toggleImplemented = (recommendationId: string) => {
    const newImplemented = new Set(implementedItems)
    if (newImplemented.has(recommendationId)) {
      newImplemented.delete(recommendationId)
    } else {
      newImplemented.add(recommendationId)
    }
    setImplementedItems(newImplemented)
    localStorage.setItem(`implemented_recommendations_${assessmentId}`, JSON.stringify(Array.from(newImplemented)))
  }

  console.log('[RecommendationsPanel] Recommendations state:', {
    totalRecommendations: recommendations?.length || 0,
    hasMore,
    isLoadingMore,
    metadata,
    firstRecommendation: recommendations?.[0] ? {
      id: recommendations[0].id,
      title: recommendations[0].title
    } : null
  })

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-error'
      case 'medium': return 'text-warning'
      case 'low': return 'text-info'
      default: return 'text-base-content'
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return 'badge-error'
      case 'medium': return 'badge-warning'
      case 'low': return 'badge-info'
      default: return 'badge-neutral'
    }
  }

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case 'high': return 'badge-error badge-outline'
      case 'medium': return 'badge-warning badge-outline'
      case 'low': return 'badge-success badge-outline'
      default: return 'badge-neutral badge-outline'
    }
  }

  if (isLoading) {
    return (
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
            <span className="ml-3">{t('loading')}</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-error mb-2">
              {t('error.title')}
            </h3>
            <p className="text-base-content/70 mb-4">
              {t('error.message')}
            </p>
            <button 
              className="btn btn-outline btn-sm"
              onClick={async () => {
                console.log('[RecommendationsPanel] Retry clicked, invalidating cache')
                await queryClient.invalidateQueries({ 
                  queryKey: aiKeys.recommendations(assessmentId, organizationId)
                })
                refetch()
              }}
            >
              {t('error.retry')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="card-title mb-2">{t('title')}</h3>
              <p className="text-base-content/70">
                {t('description')}
              </p>
            </div>

            <div className="text-sm text-base-content/70">
              {metadata && (
                <div>
                  {t('showingRecommendations', { 
                    count: recommendations.length, 
                    total: metadata.total_available 
                  })}
                </div>
              )}
              {isPolling && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="loading loading-spinner loading-xs"></span>
                  <span className="text-xs">{t('generatingMore') || 'Generating more recommendations...'}</span>
                </div>
              )}
            </div>

            <div className="flex-shrink-0">
              <div className="flex gap-2">
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    try {
                      console.log('[RecommendationsPanel] Generate more recommendations clicked')
                      await generateMore()
                      notify.success(t('generateSuccess') || 'Recommendations generated successfully!')
                    } catch (error) {
                      console.error('[RecommendationsPanel] Failed to generate recommendations:', error)
                      notify.error(t('error.message') || 'Failed to generate recommendations')
                    }
                  }}
                  disabled={isLoading || isLoadingMore}
                >
                  {!(isLoading || isLoadingMore) && <LightBulbIcon className="w-4 h-4" />}
                  {(isLoading || isLoadingMore) ? t('loading') : t('generateNew')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      {recommendations.length > 0 && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Priority Filter */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">{t('filters.priority')}</span>
                </label>
                <select 
                  className="select select-bordered"
                  value={filters.priority || 'all'}
                  onChange={(e) => setFilters({ ...filters, priority: e.target.value === 'all' ? undefined : e.target.value })}
                >
                  <option value="all">{t('filters.all')}</option>
                  <option value="high">{t('priority.high')}</option>
                  <option value="medium">{t('priority.medium')}</option>
                  <option value="low">{t('priority.low')}</option>
                </select>
              </div>
              
              {/* Effort Filter */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">{t('filters.effort')}</span>
                </label>
                <select 
                  className="select select-bordered"
                  value={filters.effort_estimate || 'all'}
                  onChange={(e) => setFilters({ ...filters, effort_estimate: e.target.value === 'all' ? undefined : e.target.value })}
                >
                  <option value="all">{t('filters.all')}</option>
                  <option value="low">{t('effort.low')}</option>
                  <option value="medium">{t('effort.medium')}</option>
                  <option value="high">{t('effort.high')}</option>
                </select>
              </div>
              
              {/* Implementation Status Filter */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">{t('filters.status')}</span>
                </label>
                <select 
                  className="select select-bordered"
                  value={filters.is_implemented === undefined ? 'all' : filters.is_implemented ? 'implemented' : 'pending'}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    is_implemented: e.target.value === 'all' ? undefined : e.target.value === 'implemented' 
                  })}
                >
                  <option value="all">{t('filters.all')}</option>
                  <option value="pending">{t('filters.pending')}</option>
                  <option value="implemented">{t('filters.implemented')}</option>
                </select>
              </div>
              
              {/* Sort By */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">{t('filters.sortBy')}</span>
                </label>
                <select 
                  className="select select-bordered"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="impact_score">{t('filters.impactScore')}</option>
                  <option value="priority">{t('filters.priority')}</option>
                  <option value="effort">{t('filters.effort')}</option>
                  <option value="created_at">{t('filters.newest')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations List */}
      <div className="space-y-4">
        {(() => {
          console.log('[RecommendationsPanel] Rendering recommendations list:', {
            count: recommendations.length,
            isLoading,
            hasError: !!error,
            hasMore,
            firstIds: recommendations.slice(0, 3).map(r => r.id)
          })
          return null
        })()}
        {recommendations.map((recommendation) => {
          const isImplemented = implementedItems.has(recommendation.id)
          
          return (
            <div 
              key={recommendation.id} 
              className={`card bg-base-100 shadow-lg transition-all animate-fade-in ${
                isImplemented ? 'opacity-75 border-success' : ''
              }`}
              style={{
                animation: 'fadeIn 0.5s ease-in-out'
              }}
            >
              <div className="card-body">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">
                      {isImplemented ? (
                        <CheckCircleIcon className="w-6 h-6 text-success" />
                      ) : (
                        <LightBulbIcon className="w-6 h-6 text-warning" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className={`font-semibold ${isImplemented ? 'line-through text-base-content/60' : 'text-base-content'}`}>
                          {recommendation.title}
                        </h4>
                        <div className={`badge ${getPriorityBadge(recommendation.priority)} badge-sm`}>
                          {t(`priority.${recommendation.priority}`)}
                        </div>
                        <div className={`badge ${getEffortBadge(recommendation.effort_estimate || 'medium')} badge-sm`}>
                          {t(`effort.${recommendation.effort_estimate || 'medium'}`)}
                        </div>
                      </div>
                      
                      {/* Measure and Control Context */}
                      {(recommendation.measure_name || recommendation.control_name) && (
                        <div className="text-xs text-base-content/60 mb-2">
                          {recommendation.measure_name && (
                            <span className="font-medium">{recommendation.measure_name}</span>
                          )}
                          {recommendation.measure_name && recommendation.control_name && <span> • </span>}
                          {recommendation.control_name && (
                            <span>{recommendation.control_name}</span>
                          )}
                        </div>
                      )}
                      
                      <p className="text-sm text-base-content/80 mb-3">
                        {recommendation.description}
                      </p>

                      {/* Implementation Steps */}
                      <div className="mb-3">
                        <h5 className="font-medium text-sm text-base-content mb-2">
                          {t('implementationSteps')}:
                        </h5>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-base-content/80 ml-4">
                          {recommendation.implementation_steps?.map((step, index) => (
                            <li key={index}>
                              {typeof step === 'string' ? step : (
                                <div>
                                  <div className="font-medium">{(step as any).step_name}</div>
                                  {(step as any).description && (
                                    <div className="text-xs text-base-content/60 mt-1">{(step as any).description}</div>
                                  )}
                                  {((step as any).time_estimate || (step as any).effort_estimate) && (
                                    <div className="text-xs text-base-content/50 mt-1">
                                      {(step as any).time_estimate && `${(step as any).time_estimate} • `}
                                      {(step as any).effort_estimate && `${(step as any).effort_estimate} effort`}
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Impact and Timeline */}
                      <div className="flex items-center gap-4 text-sm text-base-content/70">
                        <div className="flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          <span>{recommendation.timeline_weeks} {t('weeks')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                          <span>+{recommendation.compliance_impact}% {t('compliance')}</span>
                        </div>
                      </div>

                      {/* Source References */}
                      {recommendation.source_references && recommendation.source_references.length > 0 && (
                        <div className="mt-3">
                          <h6 className="font-medium text-xs text-base-content/60 mb-1">
                            {t('sourceReferences')}:
                          </h6>
                          <div className="flex flex-wrap gap-1">
                            {recommendation.source_references.map((ref, index) => (
                              <span 
                                key={index}
                                className="badge badge-neutral badge-xs"
                              >
                                {typeof ref === 'string' ? ref : (ref as any).reference}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="ml-4 flex flex-col gap-2">
                    <button 
                      className={`btn btn-sm ${
                        isImplemented 
                          ? 'btn-outline btn-success' 
                          : 'btn-outline btn-primary'
                      }`}
                      onClick={() => toggleImplemented(recommendation.id)}
                    >
                      {isImplemented ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4" />
                          {t('implemented')}
                        </>
                      ) : (
                        <>
                          <DocumentTextIcon className="w-4 h-4" />
                          {t('markImplemented')}
                        </>
                      )}
                    </button>
                    
                    {/* Regenerate Button */}
                    <button 
                      className="btn btn-sm btn-ghost"
                      onClick={async () => {
                        const newRegeneratingIds = new Set(regeneratingIds)
                        newRegeneratingIds.add(recommendation.id)
                        setRegeneratingIds(newRegeneratingIds)
                        
                        try {
                          await regenerateRecommendation(recommendation.id)
                          notify.success(t('regenerateSuccess') || 'Recommendation regenerated successfully!')
                        } catch (error) {
                          console.error('[RecommendationsPanel] Failed to regenerate:', error)
                          notify.error(t('regenerateError') || 'Failed to regenerate recommendation')
                        } finally {
                          const updatedRegeneratingIds = new Set(regeneratingIds)
                          updatedRegeneratingIds.delete(recommendation.id)
                          setRegeneratingIds(updatedRegeneratingIds)
                        }
                      }}
                      title={t('regenerate')}
                      disabled={regeneratingIds.has(recommendation.id)}
                    >
                      {regeneratingIds.has(recommendation.id) ? (
                        <LoadingSpinner className="w-4 h-4" />
                      ) : (
                        <ArrowPathIcon className="w-4 h-4" />
                      )}
                      {t('regenerate')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Show More Button */}
      {hasMore && !isLoadingMore && recommendations.length > 0 && (
        <div className="text-center mt-8">
          <button 
            className="btn btn-primary"
            onClick={generateMore}
          >
            {t('actions.showMore') || 'Show More Recommendations'}
          </button>
          {metadata && (
            <p className="text-sm text-base-content/70 mt-2">
              {t('showingInfo', { 
                showing: recommendations.length, 
                remaining: metadata.remaining_gaps 
              }) || `${metadata.remaining_gaps} more recommendations available`}
            </p>
          )}
        </div>
      )}
      
      {/* Loading More State */}
      {isLoadingMore && (
        <div className="text-center mt-8">
          <LoadingSpinner />
          <p className="text-sm text-base-content/70 mt-2">
            {t('loadingMore') || 'Generating more recommendations...'}
          </p>
        </div>
      )}
      
      {/* Empty State */}
      {!isLoading && recommendations.length === 0 && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body text-center py-12">
            <LightBulbIcon className="w-16 h-16 text-base-content/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-base-content mb-2">
              {t('noRecommendations.title')}
            </h3>
            <p className="text-base-content/70">
              {t('noRecommendations.description')}
            </p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {recommendations.length > 0 && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <h4 className="text-lg font-semibold mb-4">{t('summary.title')}</h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-error">
                  {recommendations?.filter(r => r.priority === 'high').length || 0}
                </div>
                <div className="text-sm text-base-content/70">
                  {t('priority.high')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">
                  {recommendations?.filter(r => r.priority === 'medium').length || 0}
                </div>
                <div className="text-sm text-base-content/70">
                  {t('priority.medium')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-info">
                  {recommendations?.filter(r => r.priority === 'low').length || 0}
                </div>
                <div className="text-sm text-base-content/70">
                  {t('priority.low')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success">
                  {implementedItems.size}
                </div>
                <div className="text-sm text-base-content/70">
                  {t('implemented')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}