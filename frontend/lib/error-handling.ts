import React from 'react'
import { toast } from 'react-hot-toast'

// Error types
export interface APIError extends Error {
  status?: number
  code?: string
  details?: Record<string, any>
}

export class NetworkError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string, public details?: Record<string, string>) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Potrebna je ponovna prijava') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

// Croatian error messages
const errorMessages = {
  network: {
    offline: 'Nema internetske veze. Molimo provjerite konekciju.',
    timeout: 'Zahtjev je istekao. Molimo pokušajte ponovo.',
    serverError: 'Greška na serveru. Molimo pokušajte kasnije.',
    notFound: 'Traženi resurs nije pronađen.',
    forbidden: 'Nemate dozvolu za pristup ovom resursu.',
    unauthorized: 'Potrebna je ponovna prijava.',
    badRequest: 'Neispravan zahtjev. Molimo provjerite podatke.',
    conflict: 'Konflikt podataka. Molimo osvježite stranicu.',
    tooManyRequests: 'Previše zahtjeva. Molimo sačekajte prije ponovnog pokušaja.',
    default: 'Dogodila se neočekivana greška. Molimo pokušajte ponovo.'
  },
  validation: {
    required: 'Ovo polje je obavezno',
    invalid: 'Neispravna vrijednost',
    tooLong: 'Vrijednost je predugačka',
    tooShort: 'Vrijednost je prekratka',
    invalidEmail: 'Neispravna email adresa',
    invalidFormat: 'Neispravan format podataka'
  },
  assessment: {
    notFound: 'Samoprocjena nije pronađena',
    cannotModify: 'Ne možete mijenjati završenu samoprocjenu',
    invalidScore: 'Ocjena mora biti između 1 i 5',
    missingAnswers: 'Potrebno je odgovoriti na sve obavezne kontrole',
    saveFailed: 'Neuspješno spremanje odgovora'
  },
  ai: {
    unavailable: 'AI usluge trenutno nisu dostupne',
    rateLimit: 'Previše AI zahtjeva. Molimo sačekajte.',
    processingError: 'Greška prilikom obrade AI zahtjeva',
    invalidResponse: 'Neispravan odgovor od AI usluge'
  }
}

// Retry configuration
interface RetryConfig {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffFactor: number
  retryCondition?: (error: Error) => boolean
}

const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  retryCondition: (error) => {
    if (error instanceof NetworkError) {
      return error.status === undefined || error.status >= 500 || error.status === 408
    }
    return false
  }
}

// Retry mechanism
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, initialDelay, maxDelay, backoffFactor, retryCondition } = {
    ...defaultRetryConfig,
    ...config
  }

  let lastError: Error
  let delay = initialDelay

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxAttempts || !retryCondition?.(lastError)) {
        throw lastError
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * backoffFactor, maxDelay)
    }
  }

  throw lastError!
}

// Error classification
export function classifyError(error: unknown): APIError {
  if (error instanceof NetworkError || error instanceof ValidationError || error instanceof AuthenticationError) {
    return error as APIError
  }

  if (error instanceof Error) {
    // Try to parse fetch errors
    if (error.message.includes('Failed to fetch')) {
      return new NetworkError(errorMessages.network.offline)
    }

    if (error.message.includes('timeout') || error.message.includes('AbortError')) {
      return new NetworkError(errorMessages.network.timeout, 408)
    }

    return { ...error, name: error.name, message: error.message } as APIError
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as any
    if (err.status || err.statusCode) {
      const status = err.status || err.statusCode
      return new NetworkError(getStatusMessage(status), status, err.code)
    }
  }

  return new NetworkError(errorMessages.network.default)
}

// Get user-friendly message for HTTP status codes
export function getStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return errorMessages.network.badRequest
    case 401:
      return errorMessages.network.unauthorized
    case 403:
      return errorMessages.network.forbidden
    case 404:
      return errorMessages.network.notFound
    case 408:
      return errorMessages.network.timeout
    case 409:
      return errorMessages.network.conflict
    case 429:
      return errorMessages.network.tooManyRequests
    case 500:
    case 502:
    case 503:
    case 504:
      return errorMessages.network.serverError
    default:
      return errorMessages.network.default
  }
}

// Error notification helper
export function showErrorToast(error: unknown, fallbackMessage?: string) {
  const classified = classifyError(error)
  const message = classified.message || fallbackMessage || errorMessages.network.default
  
  toast.error(message, {
    duration: 5000,
    position: 'top-right',
    style: {
      background: '#fee2e2',
      color: '#991b1b',
      border: '1px solid #fecaca'
    }
  })
}

// Success notification helper
export function showSuccessToast(message: string) {
  toast.success(message, {
    duration: 3000,
    position: 'top-right',
    style: {
      background: '#dcfce7',
      color: '#166534',
      border: '1px solid #bbf7d0'
    }
  })
}

// Warning notification helper
export function showWarningToast(message: string) {
  toast(message, {
    duration: 4000,
    position: 'top-right',
    icon: '⚠️',
    style: {
      background: '#fef3c7',
      color: '#92400e',
      border: '1px solid #fde68a'
    }
  })
}

// Enhanced error handling for async operations
export function handleAsyncError<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    showToast?: boolean
    fallbackMessage?: string
    onError?: (error: Error) => void
    retryConfig?: Partial<RetryConfig>
  } = {}
): T {
  return (async (...args: Parameters<T>) => {
    try {
      if (options.retryConfig) {
        return await withRetry(() => fn(...args), options.retryConfig)
      }
      return await fn(...args)
    } catch (error) {
      const classified = classifyError(error)
      
      if (options.showToast !== false) {
        showErrorToast(classified, options.fallbackMessage)
      }
      
      if (options.onError) {
        options.onError(classified)
      }
      
      throw classified
    }
  }) as T
}

// Connection status monitoring
export class ConnectionMonitor {
  private listeners: Set<(online: boolean) => void> = new Set()
  private _isOnline: boolean = navigator.onLine

  constructor() {
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
  }

  private handleOnline = () => {
    this._isOnline = true
    this.notifyListeners(true)
    showSuccessToast('Internetska veza je obnovljena')
  }

  private handleOffline = () => {
    this._isOnline = false
    this.notifyListeners(false)
    showWarningToast('Nema internetske veze')
  }

  private notifyListeners(online: boolean) {
    this.listeners.forEach(listener => listener(online))
  }

  get isOnline(): boolean {
    return this._isOnline
  }

  addListener(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy() {
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    this.listeners.clear()
  }
}

// Singleton instance
export const connectionMonitor = new ConnectionMonitor()

// React hook for connection status
export function useConnectionStatus() {
  const [isOnline, setIsOnline] = React.useState(connectionMonitor.isOnline)

  React.useEffect(() => {
    const cleanup = connectionMonitor.addListener(setIsOnline)
    return cleanup
  }, [])

  return isOnline
}

// Specific error handlers for different domains
export const assessmentErrorHandler = {
  handleSaveError: (error: unknown) => {
    const classified = classifyError(error)
    if (classified.status === 409) {
      showErrorToast(error, 'Samoprocjena je modificirana od strane drugog korisnika. Molimo osvježite stranicu.')
    } else if (classified.status === 403) {
      showErrorToast(error, 'Nemate dozvolu za mijenjanje ove samoprocjene.')
    } else {
      showErrorToast(error, errorMessages.assessment.saveFailed)
    }
  },

  handleSubmitError: (error: unknown) => {
    const classified = classifyError(error)
    if (classified.status === 422) {
      showErrorToast(error, errorMessages.assessment.missingAnswers)
    } else {
      showErrorToast(error, 'Neuspješno slanje samoprocjene')
    }
  }
}

export const aiErrorHandler = {
  handleAIError: (error: unknown) => {
    const classified = classifyError(error)
    if (classified.status === 429) {
      showErrorToast(error, errorMessages.ai.rateLimit)
    } else if (classified.status === 503) {
      showErrorToast(error, errorMessages.ai.unavailable)
    } else {
      showErrorToast(error, errorMessages.ai.processingError)
    }
  }
}