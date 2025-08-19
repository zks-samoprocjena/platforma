'use client'

// React hooks for comprehensive logging throughout the application
import React, { useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { logger, LogCategory } from '@/lib/logger'

// Hook for automatic page view logging
export function usePageViewLogging() {
  const pathname = usePathname()
  const locale = useLocale()
  const previousPath = useRef<string>('')

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') return
    
    // Safely get search params without causing SSR issues
    const searchParams = new URLSearchParams(window.location.search)
    const currentPath = `${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`
    
    // Log page view
    logger.info(LogCategory.NAVIGATION, `Page viewed: ${currentPath}`, {
      path: currentPath,
      locale,
      referrer: previousPath.current || 'direct',
      timestamp: Date.now()
    })

    // Update previous path
    previousPath.current = currentPath

    // Log page unload
    return () => {
      logger.debug(LogCategory.NAVIGATION, `Page unloaded: ${currentPath}`, {
        path: currentPath,
        timeOnPage: Date.now() - (previousPath.current ? 0 : Date.now())
      })
    }
  }, [pathname, locale])
}

// Hook for form interaction logging
export function useFormLogging(formId: string) {
  const startTime = useRef<number>(Date.now())
  const interactions = useRef<number>(0)

  const logFieldInteraction = useCallback((fieldName: string, action: 'focus' | 'blur' | 'change') => {
    interactions.current++
    logger.debug(LogCategory.FORM_SUBMISSION, `Form field ${action}: ${fieldName}`, {
      formId,
      fieldName,
      action,
      totalInteractions: interactions.current
    })
  }, [formId])

  const logFormSubmission = useCallback((success: boolean, errors?: string[]) => {
    const duration = Date.now() - startTime.current
    
    logger.info(LogCategory.FORM_SUBMISSION, `Form submission: ${formId}`, {
      formId,
      success,
      errors,
      duration,
      totalInteractions: interactions.current
    })
  }, [formId])

  const logFormValidation = useCallback((fieldName: string, isValid: boolean, errorMessage?: string) => {
    logger.debug(LogCategory.FORM_SUBMISSION, `Form validation: ${fieldName}`, {
      formId,
      fieldName,
      isValid,
      errorMessage
    })
  }, [formId])

  return {
    logFieldInteraction,
    logFormSubmission,
    logFormValidation
  }
}

// Hook for API call logging
export function useApiLogging() {
  const logApiCall = useCallback((
    method: string,
    endpoint: string,
    startTime: number,
    status?: number,
    responseSize?: number,
    error?: Error
  ) => {
    const duration = Date.now() - startTime
    
    if (error || (status && status >= 400)) {
      logger.error(LogCategory.API, `API call failed: ${method} ${endpoint}`, error, {
        method,
        endpoint,
        status,
        duration,
        responseSize
      })
    } else {
      logger.info(LogCategory.API, `API call successful: ${method} ${endpoint}`, {
        method,
        endpoint,
        status,
        duration,
        responseSize
      })
    }
  }, [])

  return { logApiCall }
}

// Hook for performance monitoring
export function usePerformanceLogging(componentName: string) {
  const mountTime = useRef<number>(Date.now())
  const renderCount = useRef<number>(0)

  useEffect(() => {
    renderCount.current++
    
    logger.debug(LogCategory.PERFORMANCE, `Component render: ${componentName}`, {
      componentName,
      renderCount: renderCount.current,
      timeSinceMount: Date.now() - mountTime.current
    })
  })

  useEffect(() => {
    logger.debug(LogCategory.UI, `Component mounted: ${componentName}`)
    
    return () => {
      const totalTime = Date.now() - mountTime.current
      logger.debug(LogCategory.UI, `Component unmounted: ${componentName}`, {
        componentName,
        totalRenders: renderCount.current,
        totalTimeAlive: totalTime
      })
    }
  }, [componentName])

  const logUserInteraction = useCallback((action: string, details?: Record<string, any>) => {
    logger.userAction(`${componentName}: ${action}`, {
      componentName,
      ...details
    })
  }, [componentName])

  return { logUserInteraction }
}

// Hook for assessment workflow logging
export function useAssessmentLogging(assessmentId?: string) {
  const logAssessmentAction = useCallback((action: string, details?: Record<string, any>) => {
    if (!assessmentId) return
    
    logger.assessmentAction(action, assessmentId, details)
  }, [assessmentId])

  const logControlInteraction = useCallback((controlId: string, action: string, details?: Record<string, any>) => {
    if (!assessmentId) return
    
    logger.info(LogCategory.ASSESSMENT, `Control ${action}: ${controlId}`, {
      assessmentId,
      controlId,
      action,
      ...details
    })
  }, [assessmentId])

  const logScoreChange = useCallback((
    controlId: string,
    scoreType: 'documentation' | 'implementation',
    oldScore: number | null,
    newScore: number | null
  ) => {
    if (!assessmentId) return
    
    logger.info(LogCategory.ASSESSMENT, `Score changed: ${controlId}`, {
      assessmentId,
      controlId,
      scoreType,
      oldScore,
      newScore,
      scoreDelta: (newScore || 0) - (oldScore || 0)
    })
  }, [assessmentId])

  return {
    logAssessmentAction,
    logControlInteraction,
    logScoreChange
  }
}

// Hook for AI interaction logging
export function useAiLogging() {
  const logAiSearch = useCallback((query: string, results: any[], duration: number) => {
    logger.aiInteraction('search', query, results, duration)
  }, [])

  const logAiQuestion = useCallback((question: string, answer: string | null, duration: number) => {
    logger.aiInteraction('question', question, answer, duration)
  }, [])

  const logAiRecommendations = useCallback((assessmentId: string, recommendations: any[], duration: number) => {
    logger.aiInteraction('recommendation', `Assessment ${assessmentId}`, recommendations, duration)
  }, [])

  const logAiRoadmap = useCallback((assessmentId: string, roadmap: any, duration: number) => {
    logger.aiInteraction('roadmap', `Assessment ${assessmentId}`, roadmap, duration)
  }, [])

  return {
    logAiSearch,
    logAiQuestion,
    logAiRecommendations,
    logAiRoadmap
  }
}

// Hook for error logging
export function useErrorLogging() {
  const logError = useCallback((error: Error, context: string, details?: Record<string, any>) => {
    logger.error(LogCategory.ERROR_HANDLING, `Error in ${context}`, error, details)
  }, [])

  const logWarning = useCallback((message: string, context: string, details?: Record<string, any>) => {
    logger.warn(LogCategory.ERROR_HANDLING, `Warning in ${context}: ${message}`, details)
  }, [])

  const logBoundaryError = useCallback((error: Error, errorInfo: any, componentStack?: string) => {
    logger.errorBoundary(error, errorInfo, componentStack)
  }, [])

  return {
    logError,
    logWarning,
    logBoundaryError
  }
}

// Hook for export/import logging
export function useExportLogging() {
  const logExport = useCallback((
    type: 'pdf' | 'excel' | 'json',
    assessmentId: string,
    success: boolean,
    fileSize?: number,
    duration?: number
  ) => {
    logger.info(LogCategory.EXPORT, `Export ${type}: ${success ? 'success' : 'failed'}`, {
      type,
      assessmentId,
      success,
      fileSize,
      duration
    })
  }, [])

  const logImport = useCallback((
    type: string,
    fileName: string,
    success: boolean,
    recordsProcessed?: number,
    errors?: string[]
  ) => {
    logger.info(LogCategory.EXPORT, `Import ${type}: ${success ? 'success' : 'failed'}`, {
      type,
      fileName,
      success,
      recordsProcessed,
      errors
    })
  }, [])

  return { logExport, logImport }
}

// Hook for Croatian language/i18n logging
export function useI18nLogging() {
  const locale = useLocale()

  const logLanguageSwitch = useCallback((fromLocale: string, toLocale: string) => {
    logger.info(LogCategory.I18N, `Language switched: ${fromLocale} -> ${toLocale}`, {
      fromLocale,
      toLocale,
      timestamp: Date.now()
    })
  }, [])

  const logTranslationMissing = useCallback((key: string, fallback?: string) => {
    logger.warn(LogCategory.I18N, `Translation missing: ${key}`, {
      key,
      locale,
      fallback
    })
  }, [locale])

  const logTranslationError = useCallback((key: string, error: Error) => {
    logger.error(LogCategory.I18N, `Translation error: ${key}`, error, {
      key,
      locale
    })
  }, [locale])

  return {
    logLanguageSwitch,
    logTranslationMissing,
    logTranslationError
  }
}

// Hook for authentication logging
export function useAuthLogging() {
  const logLogin = useCallback((method: string, success: boolean, error?: string) => {
    logger.info(LogCategory.AUTHENTICATION, `Login attempt: ${success ? 'success' : 'failed'}`, {
      method,
      success,
      error
    })
  }, [])

  const logLogout = useCallback((reason: 'user' | 'timeout' | 'error') => {
    logger.info(LogCategory.AUTHENTICATION, `Logout: ${reason}`, {
      reason
    })
  }, [])

  const logTokenRefresh = useCallback((success: boolean, error?: string) => {
    logger.info(LogCategory.AUTHENTICATION, `Token refresh: ${success ? 'success' : 'failed'}`, {
      success,
      error
    })
  }, [])

  return {
    logLogin,
    logLogout,
    logTokenRefresh
  }
}

// Context provider for logging
export function LoggingProvider({ children }: { children: React.ReactNode }) {
  usePageViewLogging()
  
  // Log app initialization
  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return
    
    logger.info(LogCategory.UI, 'Application initialized', {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onlineStatus: navigator.onLine
    })
    
    // Log when app becomes visible/hidden
    const handleVisibilityChange = () => {
      logger.info(LogCategory.UI, `App visibility changed: ${document.hidden ? 'hidden' : 'visible'}`)
    }
    
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      logger.info(LogCategory.UI, 'Application cleanup')
    }
  }, [])

  return React.createElement(React.Fragment, null, children)
}