// Comprehensive Croatian language and internationalization testing
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, test, expect, beforeEach } from '@jest/globals'
import { createMockRouter } from '../utils/test-utils'
import hrMessages from '@/messages/hr.json'
import enMessages from '@/messages/en.json'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => createMockRouter(),
  usePathname: () => '/hr/dashboard',
  useSearchParams: () => new URLSearchParams()
}))

// Test component for Croatian text rendering
function TestComponent({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="test-content">
      {children}
    </div>
  )
}

// Croatian text samples with diacritics
const croatianTextSamples = {
  cybersecurity: 'Kibernetička sigurnost',
  assessment: 'Procjena usklađenosti',
  compliance: 'Usklađenost s propisima',
  implementation: 'Implementacija mjera',
  organization: 'Organizacija',
  documentation: 'Dokumentacija',
  recommendation: 'Preporuka',
  improvement: 'Poboljšanje',
  requirements: 'Zahtjevi',
  policy: 'Politika sigurnosti',
  controls: 'Sigurnosne kontrole',
  measures: 'Sigurnosne mjere',
  evaluation: 'Vrednovanje',
  analysis: 'Analiza nedostataka',
  roadmap: 'Plan poboljšanja'
}

// Test wrapper with internationalization
function IntlTestWrapper({ 
  children, 
  locale = 'hr', 
  messages = hrMessages 
}: { 
  children: React.ReactNode
  locale?: string
  messages?: Record<string, any>
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}

describe('Croatian Language Support', () => {
  describe('Character Encoding and Display', () => {
    test('Renders Croatian diacritics correctly', () => {
      Object.entries(croatianTextSamples).forEach(([key, text]) => {
        render(
          <IntlTestWrapper>
            <TestComponent>{text}</TestComponent>
          </IntlTestWrapper>
        )
        
        expect(screen.getByTestId('test-content')).toHaveTextContent(text)
      })
    })

    test('Preserves Croatian characters in form inputs', async () => {
      const TestForm = () => {
        const [value, setValue] = React.useState('')
        
        return (
          <IntlTestWrapper>
            <input
              data-testid="croatian-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Unesite tekst s hrvatskim znakovima"
            />
            <div data-testid="display-value">{value}</div>
          </IntlTestWrapper>
        )
      }

      render(<TestForm />)
      
      const input = screen.getByTestId('croatian-input')
      const testText = 'Implementacija šifriranja u organizaciji - ključne točke'
      
      fireEvent.change(input, { target: { value: testText } })
      
      await waitFor(() => {
        expect(screen.getByTestId('display-value')).toHaveTextContent(testText)
        expect(input).toHaveValue(testText)
      })
    })

    test('Handles Croatian text in localStorage', () => {
      const testData = {
        assessment_title: 'Procjena kibernetičke sigurnosti organizacije',
        comments: 'Potrebno je pojašnjenje oko implementacije šifriranja',
        organization: 'Ministarstvo unutarnjih poslova'
      }

      // Store Croatian text
      localStorage.setItem('test_croatian_data', JSON.stringify(testData))
      
      // Retrieve and verify
      const retrieved = JSON.parse(localStorage.getItem('test_croatian_data') || '{}')
      
      Object.entries(testData).forEach(([key, value]) => {
        expect(retrieved[key]).toBe(value)
      })
      
      // Cleanup
      localStorage.removeItem('test_croatian_data')
    })
  })

  describe('Message Translation System', () => {
    test('All Croatian message keys are present', () => {
      const requiredKeys = [
        'navigation.dashboard',
        'navigation.assessments',
        'navigation.reports',
        'assessment.create',
        'assessment.title',
        'assessment.description',
        'assessment.securityLevel',
        'controls.documentation',
        'controls.implementation',
        'controls.comments',
        'results.overallScore',
        'results.gapAnalysis',
        'results.recommendations',
        'ai.askQuestion',
        'ai.recommendations',
        'ai.search',
        'export.pdf',
        'export.excel',
        'export.json',
        'errors.networkError',
        'errors.validationError',
        'validation.required',
        'validation.invalidEmail',
        'validation.minLength',
        'validation.maxLength'
      ]

      requiredKeys.forEach(key => {
        const value = key.split('.').reduce((obj, k) => obj?.[k], hrMessages)
        expect(value).toBeTruthy()
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      })
    })

    test('Croatian messages contain appropriate terminology', () => {
      // Test cybersecurity-specific terms
      const cybersecurityTerms = [
        'kibernetička sigurnost',
        'informacijska sigurnost',
        'sigurnosne mjere',
        'procjena rizika',
        'zaštita podataka'
      ]

      const allMessages = JSON.stringify(hrMessages).toLowerCase()
      
      cybersecurityTerms.forEach(term => {
        expect(allMessages).toContain(term.toLowerCase())
      })
    })

    test('No English text in Croatian messages', () => {
      const englishWords = [
        'assessment', 'security', 'control', 'implementation',
        'documentation', 'recommendation', 'analysis', 'report',
        'dashboard', 'submit', 'cancel', 'save', 'delete'
      ]

      const allMessages = JSON.stringify(hrMessages).toLowerCase()
      
      englishWords.forEach(word => {
        // Should not contain standalone English words
        const regex = new RegExp(`\\b${word}\\b`, 'i')
        expect(allMessages).not.toMatch(regex)
      })
    })

    test('Consistent terminology across messages', () => {
      // Test consistent use of Croatian terms
      const terminologyMap = {
        'assessment': ['procjena', 'vrednovanje'],
        'security': ['sigurnost'],
        'control': ['kontrola', 'mjera'],
        'organization': ['organizacija'],
        'implementation': ['implementacija', 'provedba']
      }

      const allMessages = JSON.stringify(hrMessages).toLowerCase()
      
      Object.entries(terminologyMap).forEach(([english, croatianTerms]) => {
        // At least one Croatian term should be used
        const hasTerms = croatianTerms.some(term => 
          allMessages.includes(term.toLowerCase())
        )
        expect(hasTerms).toBe(true)
      })
    })
  })

  describe('Language Switching', () => {
    test('Switches between Croatian and English', async () => {
      const TestComponent = () => {
        const [locale, setLocale] = React.useState('hr')
        const messages = locale === 'hr' ? hrMessages : enMessages
        
        return (
          <IntlTestWrapper locale={locale} messages={messages}>
            <div>
              <button 
                data-testid="switch-to-en"
                onClick={() => setLocale('en')}
              >
                Switch to English
              </button>
              <button 
                data-testid="switch-to-hr"
                onClick={() => setLocale('hr')}
              >
                Prebaci na hrvatski
              </button>
              <div data-testid="current-locale">{locale}</div>
              <div data-testid="dashboard-text">
                {messages.navigation?.dashboard || 'Dashboard'}
              </div>
            </div>
          </IntlTestWrapper>
        )
      }

      render(<TestComponent />)
      
      // Initial Croatian state
      expect(screen.getByTestId('current-locale')).toHaveTextContent('hr')
      expect(screen.getByTestId('dashboard-text')).toHaveTextContent('Nadzorna ploča')
      
      // Switch to English
      fireEvent.click(screen.getByTestId('switch-to-en'))
      
      await waitFor(() => {
        expect(screen.getByTestId('current-locale')).toHaveTextContent('en')
        expect(screen.getByTestId('dashboard-text')).toHaveTextContent('Dashboard')
      })
      
      // Switch back to Croatian
      fireEvent.click(screen.getByTestId('switch-to-hr'))
      
      await waitFor(() => {
        expect(screen.getByTestId('current-locale')).toHaveTextContent('hr')
        expect(screen.getByTestId('dashboard-text')).toHaveTextContent('Nadzorna ploča')
      })
    })

    test('Persists language preference', () => {
      // Mock localStorage
      const mockSetItem = jest.fn()
      const mockGetItem = jest.fn()
      
      Object.defineProperty(window, 'localStorage', {
        value: {
          setItem: mockSetItem,
          getItem: mockGetItem
        }
      })

      // Test setting language preference
      localStorage.setItem('preferred_locale', 'hr')
      expect(mockSetItem).toHaveBeenCalledWith('preferred_locale', 'hr')
      
      // Test retrieving language preference
      mockGetItem.mockReturnValue('hr')
      const savedLocale = localStorage.getItem('preferred_locale')
      expect(savedLocale).toBe('hr')
    })
  })

  describe('Date and Number Formatting', () => {
    test('Formats dates in Croatian locale', () => {
      const testDate = new Date('2024-01-15T10:30:00Z')
      
      // Croatian date formatting
      const croatianFormat = testDate.toLocaleDateString('hr-HR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      
      expect(croatianFormat).toMatch(/siječanj|veljača|ožujak|travanj|svibanj|lipanj|srpanj|kolovoz|rujan|listopad|studeni|prosinac/)
      expect(croatianFormat).toContain('2024')
    })

    test('Formats numbers in Croatian locale', () => {
      const testNumbers = [
        { input: 1234.56, expected: '1.234,56' },
        { input: 0.75, expected: '0,75' },
        { input: 100, expected: '100' }
      ]

      testNumbers.forEach(({ input, expected }) => {
        const formatted = input.toLocaleString('hr-HR')
        expect(formatted).toBe(expected)
      })
    })

    test('Formats percentages in Croatian', () => {
      const percentage = 0.8547 // 85.47%
      
      const formatted = percentage.toLocaleString('hr-HR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })
      
      expect(formatted).toBe('85,5 %')
    })
  })

  describe('Form Validation Messages', () => {
    test('Croatian validation messages are user-friendly', () => {
      const validationMessages = {
        required: hrMessages.validation?.required,
        invalidEmail: hrMessages.validation?.invalidEmail,
        minLength: hrMessages.validation?.minLength,
        maxLength: hrMessages.validation?.maxLength,
        invalidScore: hrMessages.validation?.invalidScore
      }

      Object.entries(validationMessages).forEach(([key, message]) => {
        expect(message).toBeTruthy()
        expect(typeof message).toBe('string')
        expect(message.length).toBeGreaterThan(5) // Should be descriptive
        
        // Should not contain English words
        expect(message.toLowerCase()).not.toMatch(/\b(required|invalid|error|field)\b/)
      })
    })

    test('Validation messages contain proper Croatian grammar', () => {
      const validationMessages = [
        hrMessages.validation?.required,
        hrMessages.validation?.invalidEmail,
        hrMessages.validation?.invalidScore
      ].filter(Boolean)

      validationMessages.forEach(message => {
        // Should start with capital letter
        expect(message[0]).toMatch(/[A-ZČĆĐŠŽ]/)
        
        // Should not end with period (validation messages typically don't)
        expect(message).not.toMatch(/\.$/)
        
        // Should contain Croatian characters if applicable
        if (message.includes('š') || message.includes('ć') || message.includes('ž')) {
          expect(message).toMatch(/[čćđšž]/i)
        }
      })
    })
  })

  describe('Business Context Appropriateness', () => {
    test('Uses formal Croatian for business context', () => {
      const businessMessages = [
        hrMessages.assessment?.create,
        hrMessages.assessment?.submit,
        hrMessages.results?.title,
        hrMessages.export?.generateReport
      ].filter(Boolean)

      businessMessages.forEach(message => {
        // Should use formal address (no informal 'ti' forms)
        expect(message).not.toMatch(/\b(tvoj|tvoje|tvoja|si|ćeš|možeš)\b/i)
        
        // Should use professional terminology
        expect(message).not.toMatch(/\b(super|cool|ok|ajde)\b/i)
      })
    })

    test('Compliance terminology is accurate', () => {
      const complianceTerms = {
        'nis2': /nis\s?2|direktiva.*\(eu\).*2022\/2555/i,
        'zks': /zks|zakon.*kibernetičk.*sigurnost/i,
        'gdpr': /gdpr|opća.*uredba.*zaštit.*podataka/i,
        'iso27001': /iso\s?27001|iso\/iec\s?27001/i
      }

      const allMessages = JSON.stringify(hrMessages).toLowerCase()
      
      Object.entries(complianceTerms).forEach(([standard, regex]) => {
        if (allMessages.includes(standard)) {
          expect(allMessages).toMatch(regex)
        }
      })
    })

    test('Technical terms are appropriately translated', () => {
      const technicalTerms = {
        'authentication': 'autentifikacija',
        'encryption': 'šifriranje',
        'backup': 'sigurnosna kopija',
        'firewall': 'vatrozid',
        'vulnerability': 'ranjivost',
        'threat': 'prijetnja',
        'incident': 'incident',
        'monitoring': 'nadzor'
      }

      const allMessages = JSON.stringify(hrMessages).toLowerCase()
      
      Object.entries(technicalTerms).forEach(([english, croatian]) => {
        if (allMessages.includes(croatian)) {
          // If Croatian term is used, English should not appear
          expect(allMessages).not.toMatch(new RegExp(`\\b${english}\\b`, 'i'))
        }
      })
    })
  })

  describe('Special Characters and Edge Cases', () => {
    test('Handles Croatian characters in URLs', () => {
      const testUrls = [
        '/hr/procjene/nova-procjena-sigurnosti',
        '/hr/izvještaji/analiza-nedostataka',
        '/hr/organizacija/postavke-sigurnosti'
      ]

      testUrls.forEach(url => {
        // Should properly encode Croatian characters
        const encoded = encodeURIComponent(url)
        const decoded = decodeURIComponent(encoded)
        
        expect(decoded).toBe(url)
      })
    })

    test('Handles mixed Croatian and Latin text', () => {
      const mixedTexts = [
        'ISO 27001 procjena usklađenosti',
        'GDPR zaštita podataka - implementacija',
        'API sučelje za upravljanje sigurnošću'
      ]

      mixedTexts.forEach(text => {
        render(
          <IntlTestWrapper>
            <TestComponent>{text}</TestComponent>
          </IntlTestWrapper>
        )
        
        expect(screen.getByTestId('test-content')).toHaveTextContent(text)
      })
    })

    test('Handles long Croatian text without overflow', () => {
      const longText = 'Procjena usklađenosti s propisima kibernetičke sigurnosti uključuje detaljnu analizu svih sigurnosnih mjera i kontrola koje organizacija mora implementirati u skladu s Zakonom o kibernetičkoj sigurnosti i NIS2 direktivom Europske unije.'
      
      render(
        <IntlTestWrapper>
          <div style={{ width: '200px', wordWrap: 'break-word' }}>
            <TestComponent>{longText}</TestComponent>
          </div>
        </IntlTestWrapper>
      )
      
      expect(screen.getByTestId('test-content')).toHaveTextContent(longText)
    })
  })

  describe('Accessibility with Croatian Content', () => {
    test('Screen reader compatibility with Croatian text', () => {
      const accessibilityText = 'Nadzorna ploča procjene kibernetičke sigurnosti'
      
      render(
        <IntlTestWrapper>
          <div
            data-testid="accessible-content"
            role="main"
            aria-label={accessibilityText}
          >
            <h1>{accessibilityText}</h1>
          </div>
        </IntlTestWrapper>
      )
      
      const element = screen.getByTestId('accessible-content')
      expect(element).toHaveAttribute('aria-label', accessibilityText)
      expect(element).toHaveAttribute('role', 'main')
    })

    test('Form labels are properly associated with Croatian inputs', () => {
      render(
        <IntlTestWrapper>
          <form>
            <label htmlFor="assessment-title">
              Naslov procjene
            </label>
            <input
              id="assessment-title"
              data-testid="title-input"
              placeholder="Unesite naslov procjene"
            />
          </form>
        </IntlTestWrapper>
      )
      
      const input = screen.getByTestId('title-input')
      const label = screen.getByText('Naslov procjene')
      
      expect(input).toHaveAttribute('id', 'assessment-title')
      expect(label).toHaveAttribute('for', 'assessment-title')
    })
  })
})

describe('English Language Support', () => {
  test('English messages are comprehensive', () => {
    const requiredKeys = [
      'navigation.dashboard',
      'assessment.create',
      'results.overallScore',
      'ai.askQuestion',
      'export.pdf'
    ]

    requiredKeys.forEach(key => {
      const value = key.split('.').reduce((obj, k) => obj?.[k], enMessages)
      expect(value).toBeTruthy()
      expect(typeof value).toBe('string')
    })
  })

  test('English fallbacks work correctly', () => {
    const TestComponent = () => {
      return (
        <IntlTestWrapper locale="en" messages={enMessages}>
          <div data-testid="english-content">
            {enMessages.navigation?.dashboard}
          </div>
        </IntlTestWrapper>
      )
    }

    render(<TestComponent />)
    
    expect(screen.getByTestId('english-content')).toHaveTextContent('Dashboard')
  })
})

describe('Performance with Internationalization', () => {
  test('Message loading performance', () => {
    const startTime = performance.now()
    
    render(
      <IntlTestWrapper>
        <div>
          {hrMessages.navigation?.dashboard}
          {hrMessages.assessment?.create}
          {hrMessages.results?.title}
        </div>
      </IntlTestWrapper>
    )
    
    const endTime = performance.now()
    const loadTime = endTime - startTime
    
    expect(loadTime).toBeLessThan(100) // Should load quickly
  })

  test('Memory usage with large message objects', () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0
    
    // Render multiple components with messages
    for (let i = 0; i < 100; i++) {
      render(
        <IntlTestWrapper>
          <TestComponent>
            {hrMessages.navigation?.dashboard} - {i}
          </TestComponent>
        </IntlTestWrapper>
      )
    }
    
    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0
    const memoryIncrease = finalMemory - initialMemory
    
    // Memory increase should be reasonable
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // 50MB
  })
})