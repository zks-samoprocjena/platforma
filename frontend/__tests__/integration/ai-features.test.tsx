// Comprehensive AI features integration testing with error scenarios
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { setupServer } from 'msw/node'
import { rest } from 'msw'
import hrMessages from '@/messages/hr.json'
import React from 'react'

// Mock AI components (these would be real components in the actual app)
const MockAISearchComponent = ({ onSearch }: { onSearch: (query: string) => void }) => {
  const [query, setQuery] = React.useState('')
  
  return (
    <div data-testid="ai-search-component">
      <input
        data-testid="ai-search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pretražite compliance dokumentaciju..."
      />
      <button
        data-testid="ai-search-button"
        onClick={() => onSearch(query)}
      >
        Pretraži
      </button>
    </div>
  )
}

const MockAIQuestionComponent = ({ onAsk }: { onAsk: (question: string) => void }) => {
  const [question, setQuestion] = React.useState('')
  
  return (
    <div data-testid="ai-question-component">
      <textarea
        data-testid="ai-question-input"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Postavite pitanje o kibernetičkoj sigurnosti..."
      />
      <button
        data-testid="ai-ask-button"
        onClick={() => onAsk(question)}
      >
        Postavi pitanje
      </button>
    </div>
  )
}

const MockAIRecommendationsComponent = ({ assessmentId }: { assessmentId: string }) => {
  const [recommendations, setRecommendations] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  
  const loadRecommendations = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/ai/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment_id: assessmentId })
      })
      const data = await response.json()
      setRecommendations(data.recommendations || [])
    } catch (error) {
      console.error('Failed to load recommendations:', error)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div data-testid="ai-recommendations-component">
      <button
        data-testid="load-recommendations-button"
        onClick={loadRecommendations}
        disabled={loading}
      >
        {loading ? 'Generiranje preporuka...' : 'Generiraj preporuke'}
      </button>
      {recommendations.length > 0 && (
        <div data-testid="recommendations-list">
          {recommendations.map((rec, index) => (
            <div key={index} data-testid={`recommendation-${index}`}>
              <h4>{rec.title}</h4>
              <p>{rec.description}</p>
              <span data-testid={`priority-${index}`}>Prioritet: {rec.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Mock API responses
const mockAIResponses = {
  search: {
    results: [
      {
        title: 'ZKS Uredba - Upravljanje rizicima',
        content: 'Članak 15 - Organizacija mora uspostaviti i održavati sustav upravljanja rizicima...',
        score: 0.92,
        source: 'zks_uredba.pdf',
        page: 45
      },
      {
        title: 'NIS2 Direktiva - Sigurnosne mjere',
        content: 'Privremeni operatori osnovnih usluga dužni su poduzeti odgovarajuće...',
        score: 0.87,
        source: 'nis2_directive.pdf',
        page: 23
      }
    ],
    total: 2,
    query_time: 0.45
  },
  question: {
    answer: 'Za implementaciju politike informacijske sigurnosti preporučuje se sljedeći pristup: 1) Analiza postojećeg stanja, 2) Definiranje ciljeva sigurnosti, 3) Izrada politike, 4) Implementacija, 5) Praćenje i poboljšanje. Politika mora biti usklađena s ZKS zahtjevima i NIS2 direktivom.',
    sources: [
      {
        title: 'ZKS Uredba - Članak 15',
        excerpt: 'Organizacija mora uspostaviti politiku informacijske sigurnosti...',
        confidence: 0.89
      },
      {
        title: 'ISO 27001 - Priručnik',
        excerpt: 'Politika informacijske sigurnosti mora biti odobrena od strane vodstva...',
        confidence: 0.76
      }
    ],
    context_used: true,
    confidence: 0.91
  },
  recommendations: {
    recommendations: [
      {
        id: 'rec-1',
        priority: 'high',
        category: 'technical',
        title: 'Implementacija MFA',
        description: 'Preporučuje se implementacija višefaktorske autentifikacije za sve administrativne račune kako bi se povećala sigurnost pristupa kritičnim sustavima.',
        effort: 'medium',
        timeline: '2-4 tjedna',
        impact: 'high'
      },
      {
        id: 'rec-2',
        priority: 'medium',
        category: 'policy',
        title: 'Ažuriranje politike sigurnosti',
        description: 'Postojeća politika informacijske sigurnosti treba biti ažurirana u skladu s najnovijim ZKS zahtjevima i NIS2 direktivom.',
        effort: 'low',
        timeline: '1-2 tjedna',
        impact: 'medium'
      }
    ],
    generated_at: new Date().toISOString(),
    assessment_id: 'test-assessment-123'
  },
  roadmap: {
    roadmap: {
      short_term: [
        {
          title: 'Uspostava osnovnih sigurnosnih politika',
          description: 'Izrada i implementacija temeljnih politika sigurnosti',
          duration: '1-2 mjeseca',
          priority: 'critical',
          tasks: [
            'Izrada politike informacijske sigurnosti',
            'Definiranje uloga i odgovornosti',
            'Uspostava procedure za upravljanje incidentima'
          ]
        }
      ],
      medium_term: [
        {
          title: 'Implementacija tehničkih kontrola',
          description: 'Postavljanje i konfiguracija tehničkih sigurnosnih mjera',
          duration: '3-6 mjeseci',
          priority: 'high',
          tasks: [
            'Implementacija MFA',
            'Postavljanje SIEM sustava',
            'Enkripcija osjetljivih podataka'
          ]
        }
      ],
      long_term: [
        {
          title: 'Kontinuirano poboljšanje',
          description: 'Uspostava procesa kontinuiranog poboljšanja sigurnosti',
          duration: '6-12 mjeseci',
          priority: 'medium',
          tasks: [
            'Redovite sigurnosne procjene',
            'Osposobljavanje osoblja',
            'Testiranje planova kontinuiteta'
          ]
        }
      ]
    },
    generated_at: new Date().toISOString()
  }
}

// MSW server setup for AI endpoints
const aiServer = setupServer(
  rest.post('/api/v1/ai/search', (req, res, ctx) => {
    return res(ctx.delay(500), ctx.json(mockAIResponses.search))
  }),

  rest.post('/api/v1/ai/question', (req, res, ctx) => {
    return res(ctx.delay(1000), ctx.json(mockAIResponses.question))
  }),

  rest.post('/api/v1/ai/recommendations', (req, res, ctx) => {
    return res(ctx.delay(2000), ctx.json(mockAIResponses.recommendations))
  }),

  rest.post('/api/v1/ai/roadmap', (req, res, ctx) => {
    return res(ctx.delay(3000), ctx.json(mockAIResponses.roadmap))
  }),

  rest.post('/api/v1/ai/control/guidance', (req, res, ctx) => {
    return res(ctx.json({
      guidance: 'Za implementaciju ove kontrole preporučuje se sljedeći pristup...',
      examples: [
        'Izrada detaljne dokumentacije',
        'Definiranje odgovornih osoba',
        'Uspostava procedure praćenja'
      ],
      references: ['ZKS Uredba, Članak 15', 'ISO 27001:2013']
    }))
  }),

  rest.get('/api/v1/ai/health', (req, res, ctx) => {
    return res(ctx.json({
      status: 'healthy',
      model: 'llama-3-8b-instruct',
      gpu_available: true,
      response_time: 0.25,
      memory_usage: '45%'
    }))
  }),

  rest.post('/api/v1/ai/feedback', (req, res, ctx) => {
    return res(ctx.json({ message: 'Povratna informacija uspješno zabilježena' }))
  })
)

// Test wrapper
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="hr" messages={hrMessages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  )
}

describe('AI Features Integration Tests', () => {
  beforeEach(() => {
    aiServer.listen()
  })

  afterEach(() => {
    aiServer.resetHandlers()
  })

  afterAll(() => {
    aiServer.close()
  })

  describe('AI Document Search', () => {
    test('Performs semantic search with Croatian queries', async () => {
      const mockOnSearch = jest.fn()
      
      render(
        <TestWrapper>
          <MockAISearchComponent onSearch={mockOnSearch} />
        </TestWrapper>
      )

      const input = screen.getByTestId('ai-search-input')
      const button = screen.getByTestId('ai-search-button')

      // Test Croatian query
      fireEvent.change(input, { target: { value: 'upravljanje rizicima kibernetičke sigurnosti' } })
      fireEvent.click(button)

      expect(mockOnSearch).toHaveBeenCalledWith('upravljanje rizicima kibernetičke sigurnosti')
    })

    test('Displays search results with Croatian content', async () => {
      let searchResults: any[] = []
      
      const SearchResultsComponent = () => {
        const [results, setResults] = React.useState<any[]>([])
        const [loading, setLoading] = React.useState(false)

        const performSearch = async (query: string) => {
          setLoading(true)
          try {
            const response = await fetch('/api/v1/ai/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, limit: 10 })
            })
            const data = await response.json()
            setResults(data.results)
            searchResults = data.results
          } catch (error) {
            console.error('Search failed:', error)
          } finally {
            setLoading(false)
          }
        }

        return (
          <div>
            <MockAISearchComponent onSearch={performSearch} />
            {loading && <div data-testid="search-loading">Pretražujem...</div>}
            {results.length > 0 && (
              <div data-testid="search-results">
                {results.map((result, index) => (
                  <div key={index} data-testid={`search-result-${index}`}>
                    <h4 data-testid={`result-title-${index}`}>{result.title}</h4>
                    <p data-testid={`result-content-${index}`}>{result.content}</p>
                    <span data-testid={`result-score-${index}`}>Relevantnost: {(result.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <SearchResultsComponent />
        </TestWrapper>
      )

      const input = screen.getByTestId('ai-search-input')
      const button = screen.getByTestId('ai-search-button')

      fireEvent.change(input, { target: { value: 'zaštita podataka' } })
      fireEvent.click(button)

      // Wait for loading state
      await waitFor(() => {
        expect(screen.getByTestId('search-loading')).toBeInTheDocument()
      })

      // Wait for results
      await waitFor(() => {
        expect(screen.getByTestId('search-results')).toBeInTheDocument()
      }, { timeout: 3000 })

      // Verify Croatian content in results
      expect(screen.getByTestId('result-title-0')).toHaveTextContent('ZKS Uredba')
      expect(screen.getByTestId('result-content-0')).toHaveTextContent('mora uspostaviti')
      expect(screen.getByTestId('result-score-0')).toHaveTextContent('92%')
    })

    test('Handles search errors gracefully', async () => {
      // Mock server error
      aiServer.use(
        rest.post('/api/v1/ai/search', (req, res, ctx) => {
          return res(ctx.status(503), ctx.json({
            error: 'AI service temporarily unavailable',
            message: 'AI usluga trenutno nije dostupna'
          }))
        })
      )

      const ErrorHandlingComponent = () => {
        const [error, setError] = React.useState<string | null>(null)

        const performSearch = async (query: string) => {
          try {
            const response = await fetch('/api/v1/ai/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query })
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              setError(errorData.message)
            }
          } catch (error) {
            setError('Greška u komunikaciji s AI uslugom')
          }
        }

        return (
          <div>
            <MockAISearchComponent onSearch={performSearch} />
            {error && (
              <div data-testid="search-error" style={{ color: 'red' }}>
                {error}
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <ErrorHandlingComponent />
        </TestWrapper>
      )

      const input = screen.getByTestId('ai-search-input')
      const button = screen.getByTestId('ai-search-button')

      fireEvent.change(input, { target: { value: 'test query' } })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByTestId('search-error')).toHaveTextContent('trenutno nije dostupna')
      })
    })
  })

  describe('AI Question & Answer', () => {
    test('Handles Croatian cybersecurity questions', async () => {
      const QuestionAnswerComponent = () => {
        const [answer, setAnswer] = React.useState<any>(null)
        const [loading, setLoading] = React.useState(false)

        const askQuestion = async (question: string) => {
          setLoading(true)
          try {
            const response = await fetch('/api/v1/ai/question', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                question, 
                organization_id: 'test-org-id-123',
                context: 'ZKS compliance',
                language: 'hr'
              })
            })
            const data = await response.json()
            setAnswer(data)
          } catch (error) {
            console.error('Question failed:', error)
          } finally {
            setLoading(false)
          }
        }

        return (
          <div>
            <MockAIQuestionComponent onAsk={askQuestion} />
            {loading && <div data-testid="question-loading">AI razmišlja...</div>}
            {answer && (
              <div data-testid="ai-answer">
                <div data-testid="answer-text">{answer.answer}</div>
                {answer.sources && (
                  <div data-testid="answer-sources">
                    <h4>Izvori:</h4>
                    {answer.sources.map((source: any, index: number) => (
                      <div key={index} data-testid={`source-${index}`}>
                        <strong>{source.title}</strong>: {source.excerpt}
                      </div>
                    ))}
                  </div>
                )}
                <div data-testid="answer-confidence">
                  Pouzdanost: {(answer.confidence * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <QuestionAnswerComponent />
        </TestWrapper>
      )

      const textarea = screen.getByTestId('ai-question-input')
      const button = screen.getByTestId('ai-ask-button')

      const question = 'Kako implementirati politiku informacijske sigurnosti u skladu s ZKS uredbom?'
      fireEvent.change(textarea, { target: { value: question } })
      fireEvent.click(button)

      // Wait for loading
      await waitFor(() => {
        expect(screen.getByTestId('question-loading')).toBeInTheDocument()
      })

      // Wait for answer
      await waitFor(() => {
        expect(screen.getByTestId('ai-answer')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Verify Croatian answer
      expect(screen.getByTestId('answer-text')).toHaveTextContent('implementaciju politike')
      expect(screen.getByTestId('answer-sources')).toBeInTheDocument()
      expect(screen.getByTestId('answer-confidence')).toHaveTextContent('91%')
    })

    test('Validates question input in Croatian', async () => {
      const ValidationComponent = () => {
        const [question, setQuestion] = React.useState('')
        const [validationError, setValidationError] = React.useState<string | null>(null)

        const validateAndAsk = (q: string) => {
          if (q.trim().length < 5) {
            setValidationError('Pitanje mora imati najmanje 5 znakova')
            return
          }
          if (q.length > 500) {
            setValidationError('Pitanje smije imati najviše 500 znakova')
            return
          }
          setValidationError(null)
          // Proceed with question...
        }

        return (
          <div>
            <textarea
              data-testid="validated-question-input"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value)
                setValidationError(null)
              }}
              placeholder="Postavite pitanje (5-500 znakova)..."
            />
            <button
              data-testid="validated-ask-button"
              onClick={() => validateAndAsk(question)}
            >
              Postavi pitanje
            </button>
            {validationError && (
              <div data-testid="validation-error" style={{ color: 'red' }}>
                {validationError}
              </div>
            )}
            <div data-testid="character-count">
              {question.length}/500 znakova
            </div>
          </div>
        )
      }

      render(
        <TestWrapper>
          <ValidationComponent />
        </TestWrapper>
      )

      const textarea = screen.getByTestId('validated-question-input')
      const button = screen.getByTestId('validated-ask-button')

      // Test too short question
      fireEvent.change(textarea, { target: { value: 'Što?' } })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByTestId('validation-error')).toHaveTextContent('najmanje 5 znakova')
      })

      // Test valid question
      fireEvent.change(textarea, { target: { value: 'Kako implementirati MFA?' } })
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.queryByTestId('validation-error')).not.toBeInTheDocument()
      })

      // Test character count
      expect(screen.getByTestId('character-count')).toHaveTextContent('22/500 znakova')
    })
  })

  describe('AI Recommendations', () => {
    test('Generates Croatian compliance recommendations', async () => {
      render(
        <TestWrapper>
          <MockAIRecommendationsComponent assessmentId="test-assessment-123" />
        </TestWrapper>
      )

      const button = screen.getByTestId('load-recommendations-button')
      fireEvent.click(button)

      // Wait for loading state
      await waitFor(() => {
        expect(button).toHaveTextContent('Generiranje preporuka...')
        expect(button).toBeDisabled()
      })

      // Wait for recommendations
      await waitFor(() => {
        expect(screen.getByTestId('recommendations-list')).toBeInTheDocument()
      }, { timeout: 5000 })

      // Verify Croatian recommendations
      expect(screen.getByTestId('recommendation-0')).toHaveTextContent('Implementacija MFA')
      expect(screen.getByTestId('recommendation-1')).toHaveTextContent('Ažuriranje politike sigurnosti')
      expect(screen.getByTestId('priority-0')).toHaveTextContent('Prioritet: high')
    })

    test('Categorizes recommendations by priority and type', async () => {
      const CategorizedRecommendationsComponent = () => {
        const [recommendations, setRecommendations] = React.useState<any[]>([])
        
        React.useEffect(() => {
          // Simulate loading recommendations
          setTimeout(() => {
            setRecommendations(mockAIResponses.recommendations.recommendations)
          }, 1000)
        }, [])

        const groupedRecs = recommendations.reduce((acc, rec) => {
          if (!acc[rec.priority]) acc[rec.priority] = []
          acc[rec.priority].push(rec)
          return acc
        }, {} as Record<string, any[]>)

        return (
          <div data-testid="categorized-recommendations">
            {Object.entries(groupedRecs).map(([priority, recs]) => (
              <div key={priority} data-testid={`priority-group-${priority}`}>
                <h3>Prioritet: {priority}</h3>
                {(recs as any[]).map((rec: any, index: number) => (
                  <div key={rec.id} data-testid={`rec-${priority}-${index}`}>
                    <h4>{rec.title}</h4>
                    <p>Kategorija: {rec.category}</p>
                    <p>Napor: {rec.effort}</p>
                    <p>Vremenski okvir: {rec.timeline}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }

      render(
        <TestWrapper>
          <CategorizedRecommendationsComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('categorized-recommendations')).toBeInTheDocument()
      })

      expect(screen.getByTestId('priority-group-high')).toBeInTheDocument()
      expect(screen.getByTestId('priority-group-medium')).toBeInTheDocument()
      expect(screen.getByTestId('rec-high-0')).toHaveTextContent('Implementacija MFA')
      expect(screen.getByTestId('rec-medium-0')).toHaveTextContent('Ažuriranje politike')
    })
  })

  describe('AI Performance and Error Handling', () => {
    test('Handles AI service timeouts', async () => {
      // Mock slow AI response
      aiServer.use(
        rest.post('/api/v1/ai/question', (req, res, ctx) => {
          return res(ctx.delay(10000)) // 10 second delay
        })
      )

      const TimeoutTestComponent = () => {
        const [status, setStatus] = React.useState<string>('ready')

        const askQuestion = async (question: string) => {
          setStatus('loading')
          try {
            const controller = new AbortController()
            setTimeout(() => controller.abort(), 5000) // 5 second timeout

            await fetch('/api/v1/ai/question', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                question,
                organization_id: 'test-org-id-123',
                language: 'hr'
              }),
              signal: controller.signal
            })
            setStatus('success')
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              setStatus('timeout')
            } else {
              setStatus('error')
            }
          }
        }

        return (
          <div>
            <MockAIQuestionComponent onAsk={askQuestion} />
            <div data-testid="ai-status">{status}</div>
            {status === 'timeout' && (
              <div data-testid="timeout-message">
                AI odgovor traje predugo. Molimo pokušajte ponovo.
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <TimeoutTestComponent />
        </TestWrapper>
      )

      const textarea = screen.getByTestId('ai-question-input')
      const button = screen.getByTestId('ai-ask-button')

      fireEvent.change(textarea, { target: { value: 'Test timeout question' } })
      fireEvent.click(button)

      expect(screen.getByTestId('ai-status')).toHaveTextContent('loading')

      await waitFor(() => {
        expect(screen.getByTestId('ai-status')).toHaveTextContent('timeout')
        expect(screen.getByTestId('timeout-message')).toBeInTheDocument()
      }, { timeout: 6000 })
    })

    test('Monitors AI service health', async () => {
      const HealthMonitorComponent = () => {
        const [health, setHealth] = React.useState<any>(null)
        const [lastCheck, setLastCheck] = React.useState<Date | null>(null)

        const checkHealth = async () => {
          try {
            const response = await fetch('/api/v1/ai/health')
            const data = await response.json()
            setHealth(data)
            setLastCheck(new Date())
          } catch (error) {
            setHealth({ status: 'unhealthy', error: 'Connection failed' })
          }
        }

        React.useEffect(() => {
          checkHealth()
          const interval = setInterval(checkHealth, 30000) // Check every 30 seconds
          return () => clearInterval(interval)
        }, [])

        return (
          <div data-testid="ai-health-monitor">
            {health && (
              <div>
                <div data-testid="ai-status">Status: {health.status}</div>
                <div data-testid="ai-model">Model: {health.model}</div>
                <div data-testid="ai-gpu">GPU: {health.gpu_available ? 'Dostupan' : 'Nedostupan'}</div>
                <div data-testid="ai-response-time">
                  Vrijeme odgovora: {health.response_time}s
                </div>
                {lastCheck && (
                  <div data-testid="last-check">
                    Zadnja provjera: {lastCheck.toLocaleTimeString('hr-HR')}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <HealthMonitorComponent />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByTestId('ai-health-monitor')).toBeInTheDocument()
        expect(screen.getByTestId('ai-status')).toHaveTextContent('healthy')
        expect(screen.getByTestId('ai-model')).toHaveTextContent('llama-3-8b-instruct')
        expect(screen.getByTestId('ai-gpu')).toHaveTextContent('Dostupan')
      })
    })

    test('Handles concurrent AI requests', async () => {
      const ConcurrentTestComponent = () => {
        const [results, setResults] = React.useState<any[]>([])
        const [activeRequests, setActiveRequests] = React.useState(0)

        const makeMultipleRequests = async () => {
          const questions = [
            'Što je MFA?',
            'Kako implementirati šifriranje?',
            'Što je SIEM?',
            'Kako upravljati rizicima?',
            'Što je incident response?'
          ]

          setActiveRequests(questions.length)
          
          const promises = questions.map(async (question, index) => {
            try {
              const response = await fetch('/api/v1/ai/question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  question,
                  organization_id: 'test-org-id-123',
                  language: 'hr'
                })
              })
              const data = await response.json()
              return { index, question, answer: data.answer }
            } catch (error) {
              return { index, question, error: 'Failed' }
            } finally {
              setActiveRequests(prev => prev - 1)
            }
          })

          const responses = await Promise.all(promises)
          setResults(responses)
        }

        return (
          <div data-testid="concurrent-test">
            <button
              data-testid="make-concurrent-requests"
              onClick={makeMultipleRequests}
            >
              Postavi 5 pitanja istovremeno
            </button>
            <div data-testid="active-requests">
              Aktivni zahtjevi: {activeRequests}
            </div>
            {results.length > 0 && (
              <div data-testid="concurrent-results">
                {results.map((result, index) => (
                  <div key={index} data-testid={`concurrent-result-${index}`}>
                    Q: {result.question} - {result.answer ? 'Odgovoreno' : 'Greška'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <ConcurrentTestComponent />
        </TestWrapper>
      )

      const button = screen.getByTestId('make-concurrent-requests')
      fireEvent.click(button)

      // Verify active requests counter
      await waitFor(() => {
        expect(screen.getByTestId('active-requests')).toHaveTextContent('5')
      })

      // Wait for all requests to complete
      await waitFor(() => {
        expect(screen.getByTestId('active-requests')).toHaveTextContent('0')
        expect(screen.getByTestId('concurrent-results')).toBeInTheDocument()
      }, { timeout: 10000 })

      // Verify all results received
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`concurrent-result-${i}`)).toBeInTheDocument()
      }
    })
  })

  describe('AI Feedback and Learning', () => {
    test('Collects user feedback on AI responses', async () => {
      const FeedbackComponent = () => {
        const [feedback, setFeedback] = React.useState<any>(null)
        const [submitted, setSubmitted] = React.useState(false)

        const submitFeedback = async (rating: number, comment: string) => {
          try {
            const response = await fetch('/api/v1/ai/feedback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                response_id: 'ai-response-123',
                rating,
                feedback: comment
              })
            })
            const data = await response.json()
            setSubmitted(true)
          } catch (error) {
            console.error('Feedback submission failed:', error)
          }
        }

        return (
          <div data-testid="feedback-component">
            {!submitted ? (
              <div>
                <div>Kako ocjenjujete ovaj AI odgovor?</div>
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    data-testid={`rating-${rating}`}
                    onClick={() => submitFeedback(rating, 'Test feedback')}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            ) : (
              <div data-testid="feedback-success">
                Hvala na povratnoj informaciji!
              </div>
            )}
          </div>
        )
      }

      render(
        <TestWrapper>
          <FeedbackComponent />
        </TestWrapper>
      )

      expect(screen.getByTestId('feedback-component')).toBeInTheDocument()
      
      // Submit rating
      fireEvent.click(screen.getByTestId('rating-4'))

      await waitFor(() => {
        expect(screen.getByTestId('feedback-success')).toHaveTextContent('Hvala na povratnoj')
      })
    })
  })
})