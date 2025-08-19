'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { 
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  UserIcon,
  SparklesIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useAIQuestion } from '@/hooks/api/use-ai'
import { useAIStreaming } from '@/hooks/api/use-ai-streaming'
import { StreamingResponse } from '@/components/ai/streaming-response'
import { useAICacheStore } from '@/stores/ai-cache-store'

interface QAMessage {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: Date
  sources?: Array<{ source: string; url?: string }>
  isStreaming?: boolean
  metadata?: any
}

interface AIQAChatProps {
  assessmentId?: string
  organizationId?: string
  controlId?: string
  className?: string
}

export function AIQAChat({ assessmentId, organizationId, controlId, className = '' }: AIQAChatProps) {
  const t = useTranslations('AI')
  const locale = useLocale()
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [useStreaming, setUseStreaming] = useState(true) // Toggle for streaming
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Cache store methods
  const { getConversations, addConversation } = useAICacheStore()
  
  // Load cached conversations on mount
  useEffect(() => {
    if (assessmentId && controlId) {
      const cachedConversations = getConversations(assessmentId, controlId)
      if (cachedConversations.length > 0) {
        console.log('[AIQAChat] Loading cached conversations:', cachedConversations.length)
        const restoredMessages: QAMessage[] = []
        cachedConversations.forEach(conv => {
          restoredMessages.push({
            id: `cached-q-${conv.timestamp}`,
            type: 'user',
            content: conv.question,
            timestamp: new Date(conv.timestamp)
          })
          restoredMessages.push({
            id: `cached-a-${conv.timestamp}`,
            type: 'ai',
            content: conv.answer,
            timestamp: new Date(conv.timestamp + 1)
          })
        })
        setMessages(restoredMessages)
      }
    }
  }, [assessmentId, controlId, getConversations])
  
  // Language flow logging
  console.log('[AIQAChat] Component initialized with locale:', locale)
  console.log('[AIQAChat] Props:', { assessmentId, organizationId, controlId })
  
  const aiQuestion = useAIQuestion()
  const aiStreaming = useAIStreaming({
    onChunk: (chunk) => {
      // Don't update here - the hook maintains the full response
      // We'll update the message content after streaming starts
    },
    onComplete: (fullResponse, metadata) => {
      console.log('[AIQAChat] Streaming complete. Response preview:', fullResponse?.substring(0, 100))
      console.log('[AIQAChat] Response metadata:', metadata)
      
      // Mark streaming as complete and set the final content
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMessage = newMessages[newMessages.length - 1]
        if (lastMessage && lastMessage.type === 'ai' && lastMessage.isStreaming) {
          lastMessage.isStreaming = false
          lastMessage.content = fullResponse
          lastMessage.metadata = metadata
          console.log('[AIQAChat] Updated last message with complete response')
        }
        return newMessages
      })
    },
    onSources: (sources) => {
      console.log('[AIQAChat] Sources received:', sources)
      // Add sources to the last AI message
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMessage = newMessages[newMessages.length - 1]
        if (lastMessage && lastMessage.type === 'ai') {
          lastMessage.sources = sources
        }
        return newMessages
      })
    },
    onError: (error) => {
      console.error('[AIQAChat] Streaming error:', error)
      // Update the last message with error
      setMessages(prev => {
        const newMessages = [...prev]
        const lastMessage = newMessages[newMessages.length - 1]
        if (lastMessage && lastMessage.type === 'ai' && lastMessage.isStreaming) {
          lastMessage.isStreaming = false
          lastMessage.content = error
        }
        return newMessages
      })
    }
  })

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Add welcome message when chat is first opened
  useEffect(() => {
    if (isExpanded && messages.length === 0) {
      console.log('[AIQAChat] Adding welcome message for locale:', locale)
      setMessages([{
        id: '1',
        type: 'ai',
        content: t('chat.welcomeMessage'),
        timestamp: new Date()
      }])
    }
  }, [isExpanded, messages.length, t, locale])

  const handleSendQuestion = async () => {
    if (!currentQuestion.trim() || aiQuestion.isPending || aiStreaming.isStreaming) return

    const userMessage: QAMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: currentQuestion,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const question = currentQuestion
    setCurrentQuestion('')

    console.log('[AIQAChat] Sending question:', question)
    console.log('[AIQAChat] Current locale:', locale)
    console.log('[AIQAChat] Language parameter will be:', locale as 'hr' | 'en')

    try {
      if (!organizationId) {
        throw new Error('Organization ID is required')
      }

      const requestPayload = {
        question,
        organization_id: organizationId,
        assessment_id: assessmentId,
        control_id: controlId,
        context: `Procjena ID: ${assessmentId || 'N/A'}${controlId ? `, Kontrola ID: ${controlId}` : ''}`,
        language: locale as 'hr' | 'en'
      }

      console.log('[AIQAChat] Request payload:', requestPayload)

      if (useStreaming) {
        console.log('[AIQAChat] Using streaming approach')
        // Create AI message placeholder for streaming
        const aiMessage: QAMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: '',
          timestamp: new Date(),
          isStreaming: true
        }
        setMessages(prev => [...prev, aiMessage])

        // Start streaming
        await aiStreaming.startStreaming(requestPayload)
      } else {
        console.log('[AIQAChat] Using non-streaming approach')
        // Use traditional non-streaming API
        const response = await aiQuestion.mutateAsync(requestPayload)

        console.log('[AIQAChat] API response received:', {
          answerPreview: response.answer?.substring(0, 100),
          language: response.language,
          sourcesCount: response.sources?.length || 0,
          confidence: response.confidence
        })

        const aiMessage: QAMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: response.answer,
          timestamp: new Date(),
          sources: response.sources
        }

        setMessages(prev => [...prev, aiMessage])
        
        // Save to cache
        if (assessmentId && controlId && response.answer) {
          addConversation(assessmentId, controlId, {
            question: currentQuestion,
            answer: response.answer,
            timestamp: Date.now()
          })
        }
      }
    } catch (error) {
      console.error('[AIQAChat] Error sending question:', error)
      const errorMessage: QAMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: t('chat.errorMessage'),
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendQuestion()
    }
  }

  const suggestedQuestions = [
    t('chat.suggestion1'),
    t('chat.suggestion2'),
    t('chat.suggestion3'),
    t('chat.suggestion4')
  ]

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`btn btn-primary gap-2 shadow-lg ${className}`}
      >
        <ChatBubbleLeftRightIcon className="h-5 w-5" />
        {t('chat.openChat')}
      </button>
    )
  }

  return (
    <div className={`bg-base-100 rounded-lg shadow-xl border border-base-300 flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-base-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <SparklesIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base-content">
              {t('chat.title')}
            </h3>
            <p className="text-sm text-base-content/70">
              {t('chat.subtitle')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Debug info */}
          <div className="text-xs text-base-content/50 bg-base-200 px-2 py-1 rounded">
            {locale.toUpperCase()}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
            />
            <span className="text-xs text-base-content/70">Streaming</span>
          </label>
          <button
            onClick={() => setIsExpanded(false)}
            className="btn btn-ghost btn-circle btn-sm"
          >
            ×
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto max-h-96 min-h-[300px]">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}>
              {message.type === 'ai' && (
                <div className="p-2 bg-primary/10 rounded-full self-end">
                  <SparklesIcon className="h-4 w-4 text-primary" />
                </div>
              )}
              
              <div className={`max-w-[80%] ${
                message.type === 'user' 
                  ? 'bg-primary text-primary-content' 
                  : ''
              }`}>
                {message.type === 'ai' && message.isStreaming ? (
                  <StreamingResponse
                    content={aiStreaming.response}
                    isStreaming={true}
                    metadata={message.metadata}
                    sources={message.sources}
                    onStop={() => aiStreaming.stopStreaming()}
                  />
                ) :
                  <div className={`${
                    message.type === 'user' 
                      ? '' 
                      : 'bg-base-200 text-base-content'
                  } rounded-lg p-3`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-base-300/50">
                        <p className="text-xs opacity-70 mb-1">
                          {t('chat.sources')}:
                        </p>
                        <ul className="text-xs opacity-80 space-y-1">
                          {message.sources.map((source, index) => (
                            <li key={index} className="flex items-center gap-1">
                              • {source.source}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div className="text-xs opacity-60 mt-2">
                      {message.timestamp.toLocaleTimeString('hr-HR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                }
              </div>
              
              {message.type === 'user' && (
                <div className="p-2 bg-secondary/10 rounded-full self-end">
                  <UserIcon className="h-4 w-4 text-secondary" />
                </div>
              )}
            </div>
          ))}
          
          {aiQuestion.isPending && (
            <div className="flex gap-3 justify-start">
              <div className="p-2 bg-primary/10 rounded-full self-end">
                <SparklesIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-base-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <span className="loading loading-dots loading-sm"></span>
                  <span className="text-sm text-base-content/70">
                    {t('chat.thinking')}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested Questions */}
      {messages.length <= 1 && (
        <div className="p-4 border-t border-base-200">
          <p className="text-sm text-base-content/70 mb-3">
            {t('chat.suggestedQuestions')}:
          </p>
          <div className="grid grid-cols-1 gap-2">
            {suggestedQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => setCurrentQuestion(question)}
                className="btn btn-sm btn-outline btn-ghost text-left justify-start h-auto py-2"
              >
                <span className="text-xs">{question}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-base-200">
        <div className="flex gap-2">
          <textarea
            value={currentQuestion}
            onChange={(e) => setCurrentQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('chat.inputPlaceholder')}
            className="textarea textarea-bordered flex-1 resize-none text-sm"
            rows={2}
            disabled={aiQuestion.isPending || aiStreaming.isStreaming}
          />
          <button
            onClick={handleSendQuestion}
            disabled={!currentQuestion.trim() || aiQuestion.isPending || aiStreaming.isStreaming}
            className="btn btn-primary btn-square"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
        
        <div className="flex items-center gap-2 mt-2 text-xs text-base-content/60">
          <span>{t('chat.tip')}</span>
          <kbd className="kbd kbd-xs">Enter</kbd>
          <span>{t('chat.send')}</span>
        </div>
      </div>
    </div>
  )
}