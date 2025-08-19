'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { 
  QuestionMarkCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SparklesIcon,
  DocumentTextIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { useAIControlGuidance, useAIQuestion } from '@/hooks/api/use-ai'
import { useAIStreaming } from '@/hooks/api/use-ai-streaming'
import { StreamingResponse } from '@/components/ai/streaming-response'
import { useAICacheStore } from '@/stores/ai-cache-store'
import { useAssessmentStore } from '@/stores/assessment-store'
import type { AssessmentControl } from '@/types/assessment'
import type { AIQuestionResponse } from '@/types/api'

interface AIHelpPanelProps {
  control: AssessmentControl
  organizationId: string
  assessmentId?: string
  isExpanded: boolean
  onToggle: () => void
}

// Helper function to format AI response with better structure
const formatAIResponse = (text: string) => {
  if (!text) return ''
  
  // Replace numbered lists with proper formatting
  let formatted = text.replace(/(\d+)\.\s+/g, '\n$1. ')
  
  // Replace bullet points
  formatted = formatted.replace(/[-•]\s+/g, '\n• ')
  
  // Remove orphan placeholder citations like "[n]"
  formatted = formatted.replace(/\[n\]/g, '')
  
  // Add spacing between paragraphs
  formatted = formatted.replace(/\n\n+/g, '\n\n')
  
  // Ensure proper line breaks after colons (for sections)
  formatted = formatted.replace(/:\s*\n?(?=[A-Z])/g, ':\n\n')
  
  // Collapse consecutive duplicate lines
  const lines = formatted.split('\n')
  const deduped: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (deduped.length === 0 || deduped[deduped.length - 1].trim() !== trimmed) {
      deduped.push(line)
    }
  }
  formatted = deduped.join('\n')
  
  // Trim extra whitespace
  return formatted.trim()
}

export function AIHelpPanel({ control, organizationId, assessmentId: propAssessmentId, isExpanded, onToggle }: AIHelpPanelProps) {
  const t = useTranslations('AI')
  const locale = useLocale()
  const [customQuestion, setCustomQuestion] = useState('')
  const [showCustomQuestion, setShowCustomQuestion] = useState(false)
  const [useStreamingMode, setUseStreamingMode] = useState(true) // Default to streaming mode
  const [hasInitiatedStreaming, setHasInitiatedStreaming] = useState(false)
  const [isUsingCache, setIsUsingCache] = useState(false)
  
  // Get assessment ID from store if not provided
  const currentAssessment = useAssessmentStore(state => state.currentAssessment)
  const assessmentId = propAssessmentId || currentAssessment?.id || ''
  
  // Cache store methods
  const { getCachedGuidance, setCachedGuidance, updateLastAccessed, addConversation, getConversations } = useAICacheStore()

  // Language flow logging
  console.log('[AIHelpPanel] Component initialized with locale:', locale)
  console.log('[AIHelpPanel] Control:', control.id, control.name_hr)
  console.log('[AIHelpPanel] Organization ID:', organizationId)
  console.log('[AIHelpPanel] Is expanded:', isExpanded)

  // Get AI guidance for this specific control (non-streaming mode)
  const { data: guidanceRaw, isLoading: guidanceLoading } = useAIControlGuidance(
    control.id,
    organizationId,
    isExpanded && !useStreamingMode
  )
  const guidance = guidanceRaw as AIQuestionResponse | undefined
  
  // Streaming hook for guidance
  const {
    response: streamingResponse,
    isStreaming,
    sources: streamingSources,
    metadata: streamingMetadata,
    error: streamingError,
    startStreaming,
    stopStreaming,
    reset: resetStreaming
  } = useAIStreaming({
    onComplete: (fullResponse, metadata) => {
      console.log('[AIHelpPanel] Streaming complete for guidance')
    },
    onError: (error) => {
      console.error('[AIHelpPanel] Streaming error:', error)
    }
  })
  
  // Separate streaming hook for custom questions
  const {
    response: questionStreamingResponse,
    isStreaming: isQuestionStreaming,
    sources: questionStreamingSources,
    metadata: questionStreamingMetadata,
    error: questionStreamingError,
    startStreaming: startQuestionStreaming,
    stopStreaming: stopQuestionStreaming,
    reset: resetQuestionStreaming
  } = useAIStreaming({
    onComplete: (fullResponse, metadata) => {
      console.log('[AIHelpPanel] Question streaming complete')
      setCustomQuestion('') // Clear input after successful response
    },
    onError: (error) => {
      console.error('[AIHelpPanel] Question streaming error:', error)
    }
  })

  // Log guidance data when received
  React.useEffect(() => {
    if (guidance) {
      console.log('[AIHelpPanel] Guidance received:', {
        controlId: control.id,
        answerPreview: guidance.answer?.substring(0, 100),
        language: guidance.language,
        sourcesCount: guidance.sources?.length || 0,
        confidence: guidance.confidence
      })
    }
  }, [guidance, control.id])
  
  // Check cache and initiate streaming when panel is expanded
  React.useEffect(() => {
    if (isExpanded && useStreamingMode && !hasInitiatedStreaming && !isStreaming && assessmentId) {
      // First check if we have cached guidance
      const cachedGuidance = getCachedGuidance(assessmentId, control.id)
      
      if (cachedGuidance) {
        console.log('[AIHelpPanel] Using cached guidance for control:', control.id)
        setIsUsingCache(true)
        // We'll display cached content directly in the render
        setHasInitiatedStreaming(true)
      } else {
        console.log('[AIHelpPanel] No cache found, fetching new guidance for control:', control.id)
        const guidanceQuestion = locale === 'hr' 
          ? `Objasni smjernice za kontrolu "${control.name_hr}". ${control.description_hr || ''} ${control.is_mandatory ? 'Ovo je obavezna kontrola.' : 'Ovo je dobrovoljna kontrola.'} Daj konkretne korake implementacije i najbolje prakse.`
          : `Explain guidelines for the control. Provide concrete implementation steps and best practices.`
        
        startStreaming({
          question: guidanceQuestion,
          organization_id: organizationId,
          control_id: control.id,
          context: `Security control for compliance assessment`,
          language: locale as 'hr' | 'en'
        })
        
        setHasInitiatedStreaming(true)
        setIsUsingCache(false)
      }
    }
  }, [isExpanded, useStreamingMode, hasInitiatedStreaming, isStreaming, control.id, organizationId, locale, assessmentId, startStreaming, getCachedGuidance])
  
  // Reset streaming state when panel is collapsed
  React.useEffect(() => {
    if (!isExpanded) {
      resetStreaming()
      setHasInitiatedStreaming(false)
      resetQuestionStreaming()
      setIsUsingCache(false)
    }
  }, [isExpanded, resetStreaming, resetQuestionStreaming])
  
  // Reset state when control changes - CRITICAL FIX
  React.useEffect(() => {
    console.log('[AIHelpPanel] Control changed to:', control.id, control.name_hr)
    resetStreaming()
    setHasInitiatedStreaming(false)
    resetQuestionStreaming()
    setIsUsingCache(false)
    setCustomQuestion('')
    setShowCustomQuestion(false)
  }, [control.id, resetStreaming, resetQuestionStreaming])
  
  // Reset question streaming when custom question section is hidden
  React.useEffect(() => {
    if (!showCustomQuestion) {
      resetQuestionStreaming()
    }
  }, [showCustomQuestion, resetQuestionStreaming])

  // Save streaming response to cache when complete
  React.useEffect(() => {
    if (streamingResponse && !isStreaming && assessmentId && !isUsingCache) {
      console.log('[AIHelpPanel] Saving guidance to cache for control:', control.id)
      setCachedGuidance(assessmentId, control.id, {
        content: streamingResponse,
        sources: streamingSources,
        metadata: streamingMetadata,
        timestamp: Date.now()
      })
    }
  }, [streamingResponse, isStreaming, assessmentId, control.id, isUsingCache, setCachedGuidance, streamingSources, streamingMetadata])
  
  // Get cached guidance for display
  const cachedGuidance = assessmentId ? getCachedGuidance(assessmentId, control.id) : null
  
  // Update last accessed time when cache is used (in useEffect to avoid re-renders)
  React.useEffect(() => {
    if (cachedGuidance && assessmentId && isUsingCache) {
      updateLastAccessed(assessmentId, control.id)
    }
  }, [isUsingCache, assessmentId, control.id]) // Don't include cachedGuidance to avoid loops
  
  // Custom question mutation
  const aiQuestion = useAIQuestion()

  const handleCustomQuestion = async () => {
    if (!customQuestion.trim()) return

    const requestPayload = {
      question: customQuestion,
      organization_id: organizationId,
      control_id: control.id,
      context: `Kontrola: ${control.name_hr}. Opis: ${control.description_hr || ''}. ${control.is_mandatory ? 'Obavezna kontrola' : 'Dobrovoljna kontrola'}.`,
      language: locale as 'hr' | 'en'
    }

    console.log('[AIHelpPanel] Sending custom question:', customQuestion)
    console.log('[AIHelpPanel] Request payload:', requestPayload)

    if (useStreamingMode) {
      // Use streaming for custom questions
      resetQuestionStreaming() // Clear any previous streaming state
      startQuestionStreaming(requestPayload)
    } else {
      // Use non-streaming mode
      try {
        const response = await aiQuestion.mutateAsync(requestPayload)
        
        console.log('[AIHelpPanel] Custom question response received:', {
          answerPreview: response.answer?.substring(0, 100),
          language: response.language,
          sourcesCount: response.sources?.length || 0,
          confidence: response.confidence
        })
        
        // Save to cache
        if (assessmentId && response.answer) {
          addConversation(assessmentId, control.id, {
            question: customQuestion,
            answer: response.answer,
            timestamp: Date.now()
          })
        }
        
        setCustomQuestion('')
      } catch (error) {
        console.error('[AIHelpPanel] Custom question failed:', error)
      }
    }
  }

  return (
    <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg border border-primary/20">
      {/* Header */}
      <div
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-primary/5 transition-colors rounded-t-lg cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <SparklesIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-base-content">
              {t('help.title')}
            </h3>
            <p className="text-sm text-base-content/70">
              {t('help.subtitle')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Streaming mode toggle */}
          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setUseStreamingMode(!useStreamingMode)
                setHasInitiatedStreaming(false)
                resetStreaming()
              }}
              className="flex items-center gap-1 text-xs text-base-content/60 hover:text-base-content bg-base-200 px-2 py-1 rounded transition-colors"
              title={useStreamingMode ? 'Switch to instant mode' : 'Switch to streaming mode'}
            >
              {useStreamingMode ? (
                <>
                  <PlayIcon className="h-3 w-3" />
                  <span>Streaming</span>
                </>
              ) : (
                <>
                  <PauseIcon className="h-3 w-3" />
                  <span>Instant</span>
                </>
              )}
            </button>
          )}
          {/* Debug info */}
          <div className="text-xs text-base-content/50 bg-base-200 px-2 py-1 rounded">
            {locale.toUpperCase()}
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="h-5 w-5 text-base-content/70" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-base-content/70" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* AI Guidance */}
          <div className="bg-base-100 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <LightBulbIcon className="h-4 w-4 text-warning" />
              <h4 className="text-sm font-semibold text-base-content">
                {t('help.guidance')}
              </h4>
            </div>
            
            {useStreamingMode ? (
              // Streaming mode - check cache first, then streaming
              isUsingCache && cachedGuidance ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-base-content/60">
                    <ArrowPathIcon className="h-3 w-3" />
                    <span>Cached response - {new Date(cachedGuidance.timestamp).toLocaleTimeString()}</span>
                    <button 
                      onClick={() => {
                        setIsUsingCache(false)
                        setHasInitiatedStreaming(false)
                        resetStreaming()
                      }}
                      className="text-primary hover:underline ml-auto"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm text-base-content/90 leading-relaxed whitespace-pre-wrap">
                      {formatAIResponse(cachedGuidance.content)}
                    </div>
                  </div>
                  {cachedGuidance.sources && cachedGuidance.sources.length > 0 && (
                    <div className="bg-base-200/50 rounded-lg p-3 border border-base-200">
                      <p className="text-xs font-medium text-base-content/70 mb-2">
                        {t('help.sources')} ({cachedGuidance.sources.length})
                      </p>
                      <div className="space-y-1">
                        {cachedGuidance.sources.slice(0, 3).map((source: any, idx: number) => (
                          <div key={idx} className="text-xs text-base-content/60">
                            • {source.source || source.title || `Source ${idx + 1}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <StreamingResponse
                  content={formatAIResponse(streamingResponse)}
                  isStreaming={isStreaming}
                  error={streamingError}
                  sources={streamingSources}
                  metadata={streamingMetadata}
                  onStop={stopStreaming}
                  className="bg-transparent [&>div]:border-0 [&>div]:shadow-none [&>div]:bg-transparent"
                />
              )
            ) : (
              // Non-streaming mode (original implementation)
              guidanceLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-4 w-full"></div>
                  <div className="skeleton h-4 w-3/4"></div>
                  <div className="skeleton h-4 w-1/2"></div>
                </div>
              ) : guidance ? (
                <div className="space-y-3">
                  {/* Main guidance content with enhanced formatting */}
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm text-base-content/90 leading-relaxed whitespace-pre-wrap">
                      {formatAIResponse(guidance.answer)}
                    </div>
                  </div>
                  
                  {/* Sources section */}
                  {guidance.sources && guidance.sources.length > 0 && (
                    <div className="bg-base-200/50 rounded-lg p-3 border border-base-200">
                      <div className="flex items-center gap-2 mb-2">
                        <DocumentTextIcon className="h-3.5 w-3.5 text-base-content/60" />
                        <p className="text-xs font-medium text-base-content/70">
                          {t('help.sources')}:
                        </p>
                      </div>
                      <ul className="space-y-1">
                        {guidance.sources.map((source, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-xs text-base-content/50 mt-0.5">•</span>
                            <span className="text-xs text-base-content/70 flex-1">
                              {source.source}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Confidence indicator */}
                  {guidance.confidence && (
                    <div className="flex items-center justify-end gap-1 text-xs text-base-content/50">
                      <span>Pouzdanost:</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1.5 w-3 rounded-full ${
                              level <= Math.round(guidance.confidence * 5)
                                ? 'bg-success'
                                : 'bg-base-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-base-content/60 italic">
                  {t('help.noGuidance')}
                </p>
              )
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => setShowCustomQuestion(!showCustomQuestion)}
              className="btn btn-sm btn-outline btn-primary gap-2"
            >
              <QuestionMarkCircleIcon className="h-4 w-4" />
              {t('help.askQuestion')}
            </button>
            
            <button
              className="btn btn-sm btn-outline btn-secondary gap-2"
              disabled
            >
              <DocumentTextIcon className="h-4 w-4" />
              {t('help.findDocuments')}
            </button>
          </div>

          {/* Custom Question Input */}
          {showCustomQuestion && (
            <div className="bg-base-100 rounded-lg p-4 border border-base-200">
              <label className="block text-sm font-medium text-base-content mb-2">
                {t('help.yourQuestion')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder={t('help.questionPlaceholder')}
                  className="input input-bordered input-sm flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomQuestion()}
                />
                <button
                  onClick={handleCustomQuestion}
                  disabled={!customQuestion.trim() || aiQuestion.isPending || isQuestionStreaming}
                  className="btn btn-sm btn-primary"
                >
                  {(aiQuestion.isPending || isQuestionStreaming) ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    t('help.ask')
                  )}
                </button>
              </div>
              
              {/* Question Response */}
              {useStreamingMode ? (
                // Streaming mode for custom questions
                (questionStreamingResponse || isQuestionStreaming || questionStreamingError) && (
                  <div className="mt-3">
                    <StreamingResponse
                      content={formatAIResponse(questionStreamingResponse)}
                      isStreaming={isQuestionStreaming}
                      error={questionStreamingError}
                      sources={questionStreamingSources}
                      metadata={questionStreamingMetadata}
                      onStop={stopQuestionStreaming}
                      className="bg-primary/5 rounded-lg border border-primary/20 [&>div]:border-0 [&>div]:shadow-none"
                    />
                  </div>
                )
              ) : (
                // Non-streaming mode (original implementation)
                <>
                  {aiQuestion.data && (
                    <div className="mt-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="prose prose-sm max-w-none">
                        <p className="text-sm text-base-content/90 leading-relaxed whitespace-pre-wrap">
                          {formatAIResponse(aiQuestion.data.answer)}
                        </p>
                      </div>
                      
                      {aiQuestion.data.sources && aiQuestion.data.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-primary/20">
                          <div className="flex items-center gap-2 mb-2">
                            <DocumentTextIcon className="h-3.5 w-3.5 text-primary/60" />
                            <p className="text-xs font-medium text-primary/70">
                              {t('help.sources')}:
                            </p>
                          </div>
                          <ul className="space-y-1">
                            {aiQuestion.data.sources.map((source, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <span className="text-xs text-primary/50 mt-0.5">•</span>
                                <span className="text-xs text-primary/80 flex-1">{source.source}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {aiQuestion.error && (
                    <div className="mt-3 p-3 bg-error/5 rounded-lg flex items-center gap-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-error flex-shrink-0" />
                      <p className="text-sm text-error">
                        {t('help.errorMessage')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Helpful Tips */}
          <div className="bg-info/5 rounded-lg p-3 border border-info/20">
            <h5 className="text-xs font-semibold text-info mb-2">
              {t('help.tips')}:
            </h5>
            <ul className="text-xs text-base-content/70 space-y-1">
              <li>• {t('help.tip1')}</li>
              <li>• {t('help.tip2')}</li>
              <li>• {t('help.tip3')}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}