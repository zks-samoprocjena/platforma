// Comprehensive testing utilities for Croatian cybersecurity assessment platform
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { ReactElement, ReactNode } from 'react'
import hrMessages from '@/messages/hr.json'
import enMessages from '@/messages/en.json'

// Mock Next.js router
export function createMockRouter(overrides = {}) {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: '/hr/dashboard',
    query: {},
    asPath: '/hr/dashboard',
    ...overrides
  }
}

// Mock useRouter hook
jest.mock('next/navigation', () => ({
  useRouter: () => createMockRouter(),
  usePathname: () => '/hr/dashboard',
  useSearchParams: () => new URLSearchParams()
}))

// Test provider wrapper
interface TestProvidersProps {
  children: ReactNode
  locale?: 'hr' | 'en'
  initialQueries?: any[]
}

function TestProviders({ children, locale = 'hr', initialQueries = [] }: TestProvidersProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        cacheTime: 0
      },
      mutations: {
        retry: false
      }
    }
  })

  // Populate initial queries if provided
  initialQueries.forEach(({ queryKey, data }) => {
    queryClient.setQueryData(queryKey, data)
  })

  const messages = locale === 'hr' ? hrMessages : enMessages

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  )
}

// Custom render function
export function renderWithProviders(
  ui: ReactElement,
  options: {
    locale?: 'hr' | 'en'
    initialQueries?: any[]
    renderOptions?: Omit<RenderOptions, 'wrapper'>
  } = {}
) {
  const { locale, initialQueries, renderOptions } = options

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders locale={locale} initialQueries={initialQueries}>
      {children}
    </TestProviders>
  )

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Mock data factories
export const mockAssessmentData = {
  create: (overrides = {}) => ({
    id: 'test-assessment-123',
    title: 'Test Procjena Kibernetičke Sigurnosti',
    description: 'Test opis procjene usklađenosti',
    security_level: 'srednja',
    status: 'draft',
    organization_id: 'test-org-456',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    due_date: '2024-03-15T23:59:59Z',
    ...overrides
  }),

  createList: (count = 3) => 
    Array.from({ length: count }, (_, index) => 
      mockAssessmentData.create({
        id: `test-assessment-${index + 1}`,
        title: `Test Procjena ${index + 1}`,
        status: index % 2 === 0 ? 'draft' : 'in_progress'
      })
    )
}

export const mockControlData = {
  create: (overrides = {}) => ({
    id: 'test-control-123',
    title: 'Politika informacijske sigurnosti',
    description: 'Organizacija mora uspostaviti, implementirati i održavati politiku informacijske sigurnosti...',
    measure_id: 'measure-1',
    submeasure_id: 'submeasure-1-1',
    is_mandatory: true,
    security_level: 'osnovna',
    implementation_guidance: 'Preporučuje se korištenje ISO 27001 standarda...',
    ...overrides
  }),

  createMeasure: (overrides = {}) => ({
    id: 'measure-1',
    title: 'Upravljanje informacijskim sustavom',
    description: 'Mjere za uspostavu i održavanje sigurnog informacijskog sustava',
    order: 1,
    submeasures: [
      {
        id: 'submeasure-1-1',
        title: 'Politike sigurnosti',
        order: 1,
        controls: [mockControlData.create()]
      }
    ],
    ...overrides
  })
}

export const mockResultsData = {
  create: (overrides = {}) => ({
    overall_score: 3.45,
    max_score: 5.0,
    completion_percentage: 68.5,
    total_controls: 277,
    completed_controls: 190,
    mandatory_controls: 220,
    mandatory_completed: 180,
    measures: [
      {
        id: 'measure-1',
        title: 'Upravljanje informacijskim sustavom',
        score: 3.2,
        max_score: 5.0,
        controls_count: 25,
        completed_count: 20,
        completion_percentage: 80.0
      }
    ],
    last_updated: '2024-01-15T15:30:00Z',
    ...overrides
  })
}

export const mockAIData = {
  createSearchResult: (overrides = {}) => ({
    title: 'ZKS Uredba - Upravljanje rizicima',
    content: 'Organizacija mora uspostaviti i održavati sustav upravljanja rizicima informacijske sigurnosti...',
    score: 0.92,
    source: 'zks_uredba.pdf',
    page: 45,
    category: 'regulation',
    ...overrides
  }),

  createQAResponse: (overrides = {}) => ({
    answer: 'Za implementaciju politike informacijske sigurnosti preporučuje se sljedeći pristup: 1) Analiza postojećeg stanja, 2) Definiranje ciljeva sigurnosti, 3) Izrada politike, 4) Implementacija, 5) Praćenje i poboljšanje.',
    sources: [
      {
        title: 'ZKS Uredba - Članak 15',
        excerpt: 'Organizacija mora uspostaviti politiku informacijske sigurnosti...',
        confidence: 0.89
      }
    ],
    context_used: true,
    confidence: 0.91,
    response_time: 1.25,
    ...overrides
  }),

  createRecommendation: (overrides = {}) => ({
    id: 'rec-1',
    priority: 'high',
    category: 'technical',
    title: 'Implementacija MFA',
    description: 'Preporučuje se implementacija višefaktorske autentifikacije za sve administrativne račune.',
    effort: 'medium',
    timeline: '2-4 tjedna',
    impact: 'high',
    cost_estimate: 'low',
    resources_required: ['IT administrator', 'Security specialist'],
    ...overrides
  })
}

// Croatian text samples for testing
export const croatianTestData = {
  cybersecurityTerms: [
    'kibernetička sigurnost',
    'informacijska sigurnost',
    'zaštita podataka',
    'upravljanje rizicima',
    'sigurnosne mjere',
    'procjena usklađenosti',
    'sigurnosne kontrole',
    'incident response',
    'kontinuitet poslovanja',
    'plan oporavka'
  ],

  complianceTerms: [
    'ZKS uredba',
    'NIS2 direktiva',
    'GDPR',
    'ISO 27001',
    'usklađenost s propisima',
    'regulatorna tijela',
    'audit sigurnosti',
    'certifikacija',
    'akreditacija',
    'nadzor'
  ],

  technicalTerms: [
    'šifriranje podataka',
    'autentifikacija',
    'autorizacija',
    'vatrozid',
    'antivirus',
    'sigurnosne kopije',
    'nadzor mreže',
    'detekcija napada',
    'penetracijski testovi',
    'ranjivosti'
  ],

  businessTerms: [
    'organizacija',
    'upravljanje',
    'politike',
    'procedure',
    'odgovornosti',
    'osposobljavanje',
    'svjesnost',
    'kultura sigurnosti',
    'kontinuirano poboljšanje',
    'upravljanje promjenama'
  ]
}

// Error scenarios for testing
export const errorScenarios = {
  network: {
    offline: 'Network request failed',
    timeout: 'Request timeout',
    serverError: 'Internal server error',
    notFound: 'Resource not found',
    unauthorized: 'Unauthorized access',
    forbidden: 'Access forbidden',
    conflict: 'Data conflict',
    rateLimit: 'Rate limit exceeded'
  },

  validation: {
    required: 'This field is required',
    invalidEmail: 'Invalid email format',
    tooShort: 'Value too short',
    tooLong: 'Value too long',
    invalidFormat: 'Invalid format',
    invalidScore: 'Score must be between 1 and 5'
  },

  ai: {
    unavailable: 'AI service unavailable',
    timeout: 'AI response timeout',
    rateLimit: 'AI rate limit exceeded',
    invalidResponse: 'Invalid AI response',
    processingError: 'AI processing error'
  }
}

// Performance testing utilities
export const performanceUtils = {
  measureRenderTime: (renderFn: () => void) => {
    const start = performance.now()
    renderFn()
    const end = performance.now()
    return end - start
  },

  measureAsyncOperation: async (operation: () => Promise<any>) => {
    const start = performance.now()
    await operation()
    const end = performance.now()
    return end - start
  },

  createLargeDataset: (size: number) => {
    return Array.from({ length: size }, (_, index) => ({
      id: `item-${index}`,
      title: `Test Item ${index}`,
      description: `Description for test item ${index}`,
      timestamp: new Date(Date.now() - index * 1000).toISOString()
    }))
  }
}

// Accessibility testing utilities
export const a11yUtils = {
  checkAriaLabels: (container: HTMLElement) => {
    const elementsWithAriaLabels = container.querySelectorAll('[aria-label]')
    return Array.from(elementsWithAriaLabels).map(el => ({
      element: el.tagName.toLowerCase(),
      label: el.getAttribute('aria-label')
    }))
  },

  checkFormLabels: (container: HTMLElement) => {
    const inputs = container.querySelectorAll('input, textarea, select')
    return Array.from(inputs).map(input => {
      const id = input.getAttribute('id')
      const label = id ? container.querySelector(`label[for="${id}"]`) : null
      return {
        element: input.tagName.toLowerCase(),
        id,
        hasLabel: !!label,
        labelText: label?.textContent || null
      }
    })
  },

  checkHeadingStructure: (container: HTMLElement) => {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    return Array.from(headings).map(heading => ({
      level: parseInt(heading.tagName.charAt(1)),
      text: heading.textContent,
      id: heading.getAttribute('id')
    }))
  }
}

// Croatian language testing utilities
export const croatianUtils = {
  validateDiacritics: (text: string) => {
    const croatianChars = /[čćđšžČĆĐŠŽ]/
    return {
      hasCroatianChars: croatianChars.test(text),
      charCount: (text.match(croatianChars) || []).length
    }
  },

  validateTerminology: (text: string, expectedTerms: string[]) => {
    const lowerText = text.toLowerCase()
    return expectedTerms.filter(term => lowerText.includes(term.toLowerCase()))
  },

  checkForEnglishWords: (text: string, englishWords: string[]) => {
    const lowerText = text.toLowerCase()
    return englishWords.filter(word => {
      const regex = new RegExp(`\\b${word.toLowerCase()}\\b`)
      return regex.test(lowerText)
    })
  }
}

// Test data cleanup utilities
export const cleanupUtils = {
  clearLocalStorage: () => {
    const testKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('test_') || key.startsWith('mock_')
    )
    testKeys.forEach(key => localStorage.removeItem(key))
  },

  clearSessionStorage: () => {
    const testKeys = Object.keys(sessionStorage).filter(key => 
      key.startsWith('test_') || key.startsWith('mock_')
    )
    testKeys.forEach(key => sessionStorage.removeItem(key))
  },

  resetQueryClient: (queryClient: QueryClient) => {
    queryClient.clear()
    queryClient.resetQueries()
  }
}

// Export all utilities
export * from '@testing-library/react'
export { renderWithProviders as render }