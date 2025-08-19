// Comprehensive logging system for Croatian cybersecurity assessment platform
import React from 'react'
import { z } from 'zod'

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

// Log categories for organized tracking
export enum LogCategory {
  // Core functionality
  AUTHENTICATION = 'auth',
  ASSESSMENT = 'assessment',
  API = 'api',
  UI = 'ui',
  
  // AI features
  AI_SEARCH = 'ai_search',
  AI_QA = 'ai_qa',
  AI_RECOMMENDATIONS = 'ai_recommendations',
  AI_ROADMAP = 'ai_roadmap',
  
  // User interactions
  USER_ACTION = 'user_action',
  NAVIGATION = 'navigation',
  FORM_SUBMISSION = 'form_submission',
  
  // System events
  PERFORMANCE = 'performance',
  ERROR_HANDLING = 'error_handling',
  NETWORK = 'network',
  
  // Internationalization
  I18N = 'i18n',
  
  // Export and reporting
  EXPORT = 'export',
  REPORTING = 'reporting'
}

// Structured log entry interface
export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  details?: Record<string, any>
  userId?: string
  sessionId?: string
  assessmentId?: string
  organizationId?: string
  locale?: string
  userAgent?: string
  url?: string
  stack?: string
  duration?: number
}

// Logger configuration
interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableStorage: boolean
  enableRemote: boolean
  remoteEndpoint?: string
  maxStorageEntries: number
  sessionId: string
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: process.env.NODE_ENV !== 'production',
  enableStorage: true,
  enableRemote: process.env.NODE_ENV === 'production',
  remoteEndpoint: process.env.NEXT_PUBLIC_LOGGING_ENDPOINT,
  maxStorageEntries: 1000,
  sessionId: generateSessionId()
}

// Generate unique session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Main Logger class
export class Logger {
  private config: LoggerConfig
  private buffer: LogEntry[] = []
  private flushInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    // Set up periodic flush for remote logging
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.flushInterval = setInterval(() => this.flushBuffer(), 30000) // 30 seconds
    }
    
    // Clean up on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushBuffer())
    }
  }

  // Core logging method
  private log(level: LogLevel, category: LogCategory, message: string, details?: Record<string, any>, error?: Error): void {
    if (level < this.config.level) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
      sessionId: this.config.sessionId,
      locale: typeof window !== 'undefined' ? window.navigator.language : 'hr-HR',
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    }

    // Add error stack if provided
    if (error) {
      entry.stack = error.stack
    }

    // Add user context if available
    if (typeof window !== 'undefined' && window.localStorage) {
      const userContext = localStorage.getItem('user_context')
      if (userContext) {
        try {
          const parsed = JSON.parse(userContext)
          entry.userId = parsed.id
          entry.organizationId = parsed.organization_id
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    // Console logging
    if (this.config.enableConsole) {
      this.logToConsole(entry)
    }

    // Local storage logging
    if (this.config.enableStorage) {
      this.logToStorage(entry)
    }

    // Remote logging (buffered)
    if (this.config.enableRemote) {
      this.buffer.push(entry)
      
      // Immediate flush for critical errors
      if (level >= LogLevel.ERROR) {
        this.flushBuffer()
      }
    }
  }

  // Convenience methods for different log levels
  debug(category: LogCategory, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, category, message, details)
  }

  info(category: LogCategory, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.INFO, category, message, details)
  }

  warn(category: LogCategory, message: string, details?: Record<string, any>): void {
    this.log(LogLevel.WARN, category, message, details)
  }

  error(category: LogCategory, message: string, error?: Error, details?: Record<string, any>): void {
    this.log(LogLevel.ERROR, category, message, details, error)
  }

  critical(category: LogCategory, message: string, error?: Error, details?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, category, message, details, error)
  }

  // Performance logging
  time(category: LogCategory, label: string): () => void {
    const startTime = performance.now()
    this.debug(category, `Timer started: ${label}`, { startTime })
    
    // Return a function to end the timer
    return () => {
      const duration = performance.now() - startTime
      this.info(category, `Timer ended: ${label}`, { duration: `${duration.toFixed(2)}ms` })
    }
  }

  // User action logging
  userAction(action: string, details?: Record<string, any>): void {
    this.info(LogCategory.USER_ACTION, `User action: ${action}`, {
      action,
      timestamp: Date.now(),
      ...details
    })
  }

  // API call logging
  apiCall(method: string, endpoint: string, status?: number, duration?: number, details?: Record<string, any>): void {
    const level = status && status >= 400 ? LogLevel.ERROR : LogLevel.INFO
    this.log(level, LogCategory.API, `API ${method} ${endpoint}`, {
      method,
      endpoint,
      status,
      duration,
      ...details
    })
  }

  // Assessment workflow logging
  assessmentAction(action: string, assessmentId: string, details?: Record<string, any>): void {
    this.info(LogCategory.ASSESSMENT, `Assessment action: ${action}`, {
      action,
      assessmentId,
      ...details
    })
  }

  // AI interaction logging
  aiInteraction(type: 'search' | 'question' | 'recommendation' | 'roadmap', query: string, response?: any, duration?: number): void {
    const category = type === 'search' ? LogCategory.AI_SEARCH : 
                    type === 'question' ? LogCategory.AI_QA :
                    type === 'recommendation' ? LogCategory.AI_RECOMMENDATIONS :
                    LogCategory.AI_ROADMAP

    this.info(category, `AI ${type} interaction`, {
      type,
      query: query.substring(0, 100), // Limit query length for privacy
      responseLength: response ? JSON.stringify(response).length : 0,
      duration,
      success: !!response
    })
  }

  // Navigation logging
  navigationEvent(from: string, to: string, method: 'click' | 'navigation' | 'redirect' = 'navigation'): void {
    this.info(LogCategory.NAVIGATION, `Navigation: ${from} -> ${to}`, {
      from,
      to,
      method
    })
  }

  // Form submission logging
  formSubmission(formId: string, success: boolean, errors?: string[], duration?: number): void {
    this.info(LogCategory.FORM_SUBMISSION, `Form submission: ${formId}`, {
      formId,
      success,
      errors,
      duration
    })
  }

  // Export logging
  exportAction(type: 'pdf' | 'excel' | 'json', assessmentId: string, success: boolean, fileSize?: number): void {
    this.info(LogCategory.EXPORT, `Export ${type}: ${success ? 'success' : 'failed'}`, {
      type,
      assessmentId,
      success,
      fileSize
    })
  }

  // Error boundary logging
  errorBoundary(error: Error, errorInfo: any, componentStack?: string): void {
    this.critical(LogCategory.ERROR_HANDLING, 'React Error Boundary triggered', error, {
      errorInfo,
      componentStack
    })
  }

  // Console logging with formatting
  private logToConsole(entry: LogEntry): void {
    const levelColors = {
      [LogLevel.DEBUG]: 'color: #6b7280',
      [LogLevel.INFO]: 'color: #3b82f6',
      [LogLevel.WARN]: 'color: #f59e0b',
      [LogLevel.ERROR]: 'color: #ef4444',
      [LogLevel.CRITICAL]: 'color: #dc2626; font-weight: bold'
    }

    const style = levelColors[entry.level] || ''
    const prefix = `[${entry.timestamp}] [${LogLevel[entry.level]}] [${entry.category}]`
    
    console.log(`%c${prefix} ${entry.message}`, style, entry.details)
  }

  // Local storage logging
  private logToStorage(entry: LogEntry): void {
    try {
      const stored = localStorage.getItem('app_logs')
      const logs: LogEntry[] = stored ? JSON.parse(stored) : []
      
      logs.push(entry)
      
      // Maintain max entries limit
      if (logs.length > this.config.maxStorageEntries) {
        logs.splice(0, logs.length - this.config.maxStorageEntries)
      }
      
      localStorage.setItem('app_logs', JSON.stringify(logs))
    } catch (error) {
      // Ignore storage errors
    }
  }

  // Remote logging (buffered)
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0 || !this.config.remoteEndpoint) return

    const logsToSend = [...this.buffer]
    this.buffer = []

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logs: logsToSend,
          sessionId: this.config.sessionId
        })
      })
    } catch (error) {
      // Put logs back in buffer on failure
      this.buffer.unshift(...logsToSend)
      console.error('Failed to send logs to remote endpoint:', error)
    }
  }

  // Get logs from storage
  getStoredLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem('app_logs')
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      return []
    }
  }

  // Clear stored logs
  clearStoredLogs(): void {
    try {
      localStorage.removeItem('app_logs')
    } catch (error) {
      // Ignore errors
    }
  }

  // Export logs as JSON
  exportLogs(): string {
    const logs = this.getStoredLogs()
    return JSON.stringify(logs, null, 2)
  }

  // Get performance metrics
  getPerformanceMetrics(): Record<string, any> {
    const logs = this.getStoredLogs()
    const performanceLogs = logs.filter(log => log.category === LogCategory.PERFORMANCE)
    
    return {
      totalLogs: logs.length,
      performanceLogs: performanceLogs.length,
      errorLogs: logs.filter(log => log.level >= LogLevel.ERROR).length,
      categories: logs.reduce((acc, log) => {
        acc[log.category] = (acc[log.category] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }
  }

  // Cleanup
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flushBuffer()
  }
}

// Singleton logger instance
export const logger = new Logger()

// Hook for React components
export function useLogger() {
  return logger
}

// Higher-order component for automatic logging
export function withLogging<T extends {}>(Component: React.ComponentType<T>) {
  return function LoggedComponent(props: T) {
    const componentName = Component.displayName || Component.name || 'Component'
    
    React.useEffect(() => {
      logger.debug(LogCategory.UI, `Component mounted: ${componentName}`)
      
      return () => {
        logger.debug(LogCategory.UI, `Component unmounted: ${componentName}`)
      }
    }, [])

    return React.createElement(Component, props)
  }
}

// Performance monitoring decorator
export function logPerformance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const startTime = performance.now()
    const methodName = `${target.constructor.name}.${propertyKey}`
    
    try {
      const result = await originalMethod.apply(this, args)
      const duration = performance.now() - startTime
      
      logger.info(LogCategory.PERFORMANCE, `Method executed: ${methodName}`, {
        method: methodName,
        duration: `${duration.toFixed(2)}ms`,
        args: args.length
      })
      
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      
      logger.error(LogCategory.PERFORMANCE, `Method failed: ${methodName}`, error as Error, {
        method: methodName,
        duration: `${duration.toFixed(2)}ms`,
        args: args.length
      })
      
      throw error
    }
  }

  return descriptor
}

// Validation schema for log entries
export const logEntrySchema = z.object({
  timestamp: z.string(),
  level: z.nativeEnum(LogLevel),
  category: z.nativeEnum(LogCategory),
  message: z.string(),
  details: z.record(z.any()).optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  assessmentId: z.string().optional(),
  organizationId: z.string().optional(),
  locale: z.string().optional(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
  stack: z.string().optional(),
  duration: z.number().optional()
})

export type LogEntryData = z.infer<typeof logEntrySchema>