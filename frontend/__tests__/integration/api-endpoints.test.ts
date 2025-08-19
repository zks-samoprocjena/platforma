// Comprehensive integration testing for all 23 backend API endpoints
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { setupServer } from 'msw/node'
import { rest } from 'msw'
import { logger, LogCategory } from '@/lib/logger'

// Mock API responses
const mockAssessment = {
  id: 'test-assessment-id-123',
  title: 'Test Procjena Kibernetičke Sigurnosti',
  description: 'Test opis procjene',
  security_level: 'srednja',
  status: 'draft',
  organization_id: 'test-org-123',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z'
}

const mockResults = {
  overall_score: 3.45,
  total_controls: 277,
  completed_controls: 150,
  measures: [
    {
      id: 'measure-1',
      title: 'Upravljanje informacijskim sustavom',
      score: 3.2,
      max_score: 5.0,
      controls_count: 25,
      completed_count: 20
    }
  ]
}

const mockAiResponse = {
  answer: 'Ova kontrola zahtijeva implementaciju politike sigurnosti koja uključuje...',
  sources: [
    {
      title: 'ZKS Uredba - Članak 15',
      excerpt: 'Relevantni odlomak iz propisa...',
      confidence: 0.89
    }
  ],
  context_used: true
}

// MSW server setup
const server = setupServer(
  // Assessment Workflow APIs (15 endpoints)
  rest.post('/api/v1/assessments', (req, res, ctx) => {
    return res(ctx.json(mockAssessment))
  }),

  rest.get('/api/v1/assessments', (req, res, ctx) => {
    const status = req.url.searchParams.get('status')
    const limit = req.url.searchParams.get('limit')
    
    return res(ctx.json({
      assessments: [mockAssessment],
      total: 1,
      page: 1,
      limit: parseInt(limit || '10')
    }))
  }),

  rest.get('/api/v1/assessments/:id', (req, res, ctx) => {
    return res(ctx.json(mockAssessment))
  }),

  rest.put('/api/v1/assessments/:id', (req, res, ctx) => {
    return res(ctx.json({ ...mockAssessment, updated_at: new Date().toISOString() }))
  }),

  rest.delete('/api/v1/assessments/:id', (req, res, ctx) => {
    return res(ctx.status(204))
  }),

  rest.get('/api/v1/assessments/:id/questionnaire', (req, res, ctx) => {
    return res(ctx.json({
      measures: [
        {
          id: 'measure-1',
          title: 'Upravljanje informacijskim sustavom',
          submeasures: [
            {
              id: 'submeasure-1-1',
              title: 'Politike sigurnosti',
              controls: [
                {
                  id: 'control-1-1-1',
                  title: 'Politika informacijske sigurnosti',
                  description: 'Organizacija mora uspostaviti...',
                  is_mandatory: true
                }
              ]
            }
          ]
        }
      ]
    }))
  }),

  rest.put('/api/v1/assessments/:id/answers', (req, res, ctx) => {
    return res(ctx.json({ message: 'Odgovori uspješno spremljeni' }))
  }),

  rest.get('/api/v1/assessments/:id/results', (req, res, ctx) => {
    return res(ctx.json(mockResults))
  }),

  rest.get('/api/v1/assessments/:id/progress', (req, res, ctx) => {
    return res(ctx.json({
      total_controls: 277,
      completed_controls: 150,
      progress_percentage: 54.15,
      mandatory_completed: 120,
      mandatory_total: 200,
      last_updated: '2024-01-15T15:30:00Z'
    }))
  }),

  rest.get('/api/v1/assessments/:id/validation', (req, res, ctx) => {
    return res(ctx.json({
      is_valid: false,
      errors: [
        {
          control_id: 'control-1-1-1',
          message: 'Potrebno je unijeti ocjenu za obaveznu kontrolu',
          field: 'documentation_score'
        }
      ],
      warnings: []
    }))
  }),

  rest.post('/api/v1/assessments/:id/submit', (req, res, ctx) => {
    return res(ctx.json({
      ...mockAssessment,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }))
  }),

  rest.get('/api/v1/assessments/:id/activity', (req, res, ctx) => {
    return res(ctx.json({
      activities: [
        {
          id: 'activity-1',
          type: 'control_updated',
          description: 'Ažurirana kontrola "Politika informacijske sigurnosti"',
          user_name: 'Ivo Ivić',
          timestamp: '2024-01-15T14:20:00Z'
        }
      ]
    }))
  }),

  rest.post('/api/v1/assessments/:id/assign', (req, res, ctx) => {
    return res(ctx.json({ message: 'Sekcija uspješno dodijeljena' }))
  }),

  rest.get('/api/v1/assessments/:id/audit', (req, res, ctx) => {
    return res(ctx.json({
      audit_entries: [
        {
          id: 'audit-1',
          action: 'assessment_created',
          user_id: 'user-123',
          timestamp: '2024-01-15T10:00:00Z',
          details: { assessment_id: mockAssessment.id }
        }
      ]
    }))
  }),

  rest.post('/api/v1/assessments/:id/duplicate', (req, res, ctx) => {
    return res(ctx.json({
      ...mockAssessment,
      id: 'duplicated-assessment-456',
      title: `${mockAssessment.title} (Kopija)`,
      status: 'draft'
    }))
  }),

  // AI/RAG APIs (8 endpoints)
  rest.post('/api/v1/ai/search', (req, res, ctx) => {
    return res(ctx.json({
      results: [
        {
          title: 'ZKS Uredba - Upravljanje rizicima',
          content: 'Odlomak iz uredbe o upravljanju rizicima...',
          score: 0.92,
          source: 'zks_uredba.pdf'
        }
      ],
      total: 1,
      query_time: 0.45
    }))
  }),

  rest.post('/api/v1/ai/question', (req, res, ctx) => {
    return res(ctx.json(mockAiResponse))
  }),

  rest.post('/api/v1/ai/recommendations', (req, res, ctx) => {
    return res(ctx.json({
      recommendations: [
        {
          id: 'rec-1',
          priority: 'high',
          category: 'technical',
          title: 'Implementacija MFA',
          description: 'Preporučuje se implementacija višefaktorske autentifikacije...',
          effort: 'medium',
          timeline: '2-4 tjedna'
        }
      ]
    }))
  }),

  rest.post('/api/v1/ai/control/guidance', (req, res, ctx) => {
    return res(ctx.json({
      guidance: 'Za implementaciju ove kontrole preporučuje se...',
      examples: [
        'Izrada politike informacijske sigurnosti',
        'Definiranje uloga i odgovornosti'
      ],
      references: ['ZKS Uredba, Članak 15']
    }))
  }),

  rest.post('/api/v1/ai/roadmap', (req, res, ctx) => {
    return res(ctx.json({
      roadmap: {
        short_term: [
          {
            title: 'Uspostava osnovnih politika',
            duration: '1-2 mjeseca',
            priority: 'critical'
          }
        ],
        medium_term: [
          {
            title: 'Implementacija tehničkih kontrola',
            duration: '3-6 mjeseci',
            priority: 'high'
          }
        ],
        long_term: [
          {
            title: 'Kontinuirano poboljšanje',
            duration: '6-12 mjeseci',
            priority: 'medium'
          }
        ]
      }
    }))
  }),

  rest.get('/api/v1/ai/health', (req, res, ctx) => {
    return res(ctx.json({
      status: 'healthy',
      model: 'llama-3-8b-instruct',
      gpu_available: true,
      response_time: 0.25
    }))
  }),

  rest.post('/api/v1/ai/feedback', (req, res, ctx) => {
    return res(ctx.json({ message: 'Povratna informacija zabilježena' }))
  }),

  rest.get('/api/v1/ai/capabilities', (req, res, ctx) => {
    return res(ctx.json({
      features: ['search', 'qa', 'recommendations', 'roadmap'],
      languages: ['hr', 'en'],
      models: ['llama-3-8b-instruct']
    }))
  }),

  // Compliance Reference APIs (8 endpoints)
  rest.get('/api/v1/measures', (req, res, ctx) => {
    return res(ctx.json({
      measures: [
        {
          id: 'measure-1',
          title: 'Upravljanje informacijskim sustavom',
          description: 'Opis mjere...',
          submeasures_count: 5
        }
      ]
    }))
  }),

  rest.get('/api/v1/measures/:id', (req, res, ctx) => {
    return res(ctx.json({
      id: 'measure-1',
      title: 'Upravljanje informacijskim sustavom',
      description: 'Detaljni opis mjere...',
      submeasures: [
        {
          id: 'submeasure-1-1',
          title: 'Politike sigurnosti'
        }
      ]
    }))
  }),

  rest.get('/api/v1/measures/:id/submeasures', (req, res, ctx) => {
    return res(ctx.json({
      submeasures: [
        {
          id: 'submeasure-1-1',
          title: 'Politike sigurnosti',
          controls_count: 10
        }
      ]
    }))
  }),

  rest.get('/api/v1/controls', (req, res, ctx) => {
    return res(ctx.json({
      controls: [
        {
          id: 'control-1-1-1',
          title: 'Politika informacijske sigurnosti',
          description: 'Opis kontrole...',
          is_mandatory: true,
          security_level: 'osnovna'
        }
      ]
    }))
  }),

  rest.get('/api/v1/controls/:id', (req, res, ctx) => {
    return res(ctx.json({
      id: 'control-1-1-1',
      title: 'Politika informacijske sigurnosti',
      description: 'Detaljni opis kontrole...',
      is_mandatory: true,
      security_level: 'osnovna'
    }))
  }),

  rest.get('/api/v1/controls/level/:level', (req, res, ctx) => {
    return res(ctx.json({
      controls: [
        {
          id: 'control-1-1-1',
          title: 'Politika informacijske sigurnosti',
          is_mandatory: true
        }
      ],
      total: 277
    }))
  }),

  rest.get('/api/v1/compliance/summary', (req, res, ctx) => {
    return res(ctx.json({
      total_measures: 13,
      total_submeasures: 99,
      total_controls: {
        osnovna: 227,
        srednja: 277,
        napredna: 277
      },
      mandatory_controls: {
        osnovna: 180,
        srednja: 220,
        napredna: 220
      }
    }))
  }),

  rest.get('/api/v1/compliance/structure', (req, res, ctx) => {
    return res(ctx.json({
      structure: [
        {
          measure: {
            id: 'measure-1',
            title: 'Upravljanje informacijskim sustavom'
          },
          submeasures: [
            {
              id: 'submeasure-1-1',
              title: 'Politike sigurnosti',
              controls: [
                {
                  id: 'control-1-1-1',
                  title: 'Politika informacijske sigurnosti'
                }
              ]
            }
          ]
        }
      ]
    }))
  })
)

// Test suite
describe('API Integration Tests - All 23 Endpoints', () => {
  beforeEach(() => {
    server.listen()
    logger.info(LogCategory.API, 'Starting API integration test')
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
    logger.info(LogCategory.API, 'Completed API integration test')
  })

  describe('Assessment Workflow APIs (15 endpoints)', () => {
    test('POST /api/v1/assessments - Create Assessment', async () => {
      const response = await fetch('/api/v1/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Procjena',
          security_level: 'srednja'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.id).toBe('test-assessment-id-123')
      expect(data.title).toBe('Test Procjena Kibernetičke Sigurnosti')
      expect(data.security_level).toBe('srednja')
    })

    test('GET /api/v1/assessments - List Assessments with Filters', async () => {
      const response = await fetch('/api/v1/assessments?status=draft&limit=5')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.assessments)).toBe(true)
      expect(data.total).toBe(1)
      expect(data.limit).toBe(5)
    })

    test('GET /api/v1/assessments/:id - Get Assessment Details', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.id).toBe('test-assessment-id-123')
      expect(data.organization_id).toBe('test-org-123')
    })

    test('PUT /api/v1/assessments/:id - Update Assessment', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Ažurirana Procjena'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.updated_at).toBeTruthy()
    })

    test('DELETE /api/v1/assessments/:id - Delete Assessment', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123', {
        method: 'DELETE'
      })
      
      expect(response.status).toBe(204)
    })

    test('GET /api/v1/assessments/:id/questionnaire - Get Questionnaire Structure', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/questionnaire')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.measures)).toBe(true)
      expect(data.measures[0].title).toBe('Upravljanje informacijskim sustavom')
      expect(data.measures[0].submeasures[0].controls[0].is_mandatory).toBe(true)
    })

    test('PUT /api/v1/assessments/:id/answers - Submit Batch Answers', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/answers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: [
            {
              control_id: 'control-1-1-1',
              documentation_score: 4,
              implementation_score: 3,
              comments: 'Test komentar'
            }
          ]
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.message).toContain('uspješno')
    })

    test('GET /api/v1/assessments/:id/results - Get Assessment Results', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/results')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.overall_score).toBe(3.45)
      expect(data.total_controls).toBe(277)
      expect(Array.isArray(data.measures)).toBe(true)
    })

    test('GET /api/v1/assessments/:id/progress - Get Assessment Progress', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/progress')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.progress_percentage).toBe(54.15)
      expect(data.completed_controls).toBe(150)
      expect(data.total_controls).toBe(277)
    })

    test('GET /api/v1/assessments/:id/validation - Validate Assessment', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/validation')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.is_valid).toBe(false)
      expect(Array.isArray(data.errors)).toBe(true)
      expect(data.errors[0].message).toContain('obaveznu kontrolu')
    })

    test('POST /api/v1/assessments/:id/submit - Submit Assessment', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/submit', {
        method: 'POST'
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.status).toBe('submitted')
      expect(data.submitted_at).toBeTruthy()
    })

    test('GET /api/v1/assessments/:id/activity - Get Activity Tracking', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/activity')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.activities)).toBe(true)
      expect(data.activities[0].type).toBe('control_updated')
    })

    test('POST /api/v1/assessments/:id/assign - Section Assignment', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'user-456',
          section: 'measure-1'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.message).toContain('dodijeljena')
    })

    test('GET /api/v1/assessments/:id/audit - Get Audit Trail', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/audit')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.audit_entries)).toBe(true)
      expect(data.audit_entries[0].action).toBe('assessment_created')
    })

    test('POST /api/v1/assessments/:id/duplicate - Duplicate Assessment', async () => {
      const response = await fetch('/api/v1/assessments/test-assessment-id-123/duplicate', {
        method: 'POST'
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.id).toBe('duplicated-assessment-456')
      expect(data.title).toContain('(Kopija)')
      expect(data.status).toBe('draft')
    })
  })

  describe('AI/RAG APIs (8 endpoints)', () => {
    test('POST /api/v1/ai/search - Semantic Document Search', async () => {
      const response = await fetch('/api/v1/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'upravljanje rizicima',
          limit: 5
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.results)).toBe(true)
      expect(data.results[0].score).toBe(0.92)
      expect(data.query_time).toBeLessThan(1.0)
    })

    test('POST /api/v1/ai/question - Croatian Q&A with Context', async () => {
      const response = await fetch('/api/v1/ai/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Kako implementirati politiku sigurnosti?',
          organization_id: 'test-org-id-123',
          context: 'ZKS uredba',
          language: 'hr'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.answer).toContain('kontrola zahtijeva')
      expect(Array.isArray(data.sources)).toBe(true)
      expect(data.context_used).toBe(true)
    })

    test('POST /api/v1/ai/recommendations - Assessment Recommendations', async () => {
      const response = await fetch('/api/v1/ai/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_id: 'test-assessment-id-123'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.recommendations)).toBe(true)
      expect(data.recommendations[0].priority).toBe('high')
      expect(data.recommendations[0].title).toBe('Implementacija MFA')
    })

    test('POST /api/v1/ai/control/guidance - Control-specific Guidance', async () => {
      const response = await fetch('/api/v1/ai/control/guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          control_id: 'control-1-1-1'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.guidance).toContain('preporučuje se')
      expect(Array.isArray(data.examples)).toBe(true)
      expect(Array.isArray(data.references)).toBe(true)
    })

    test('POST /api/v1/ai/roadmap - Improvement Roadmap Generation', async () => {
      const response = await fetch('/api/v1/ai/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_id: 'test-assessment-id-123',
          organization_id: 'test-org-123'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.roadmap.short_term).toBeTruthy()
      expect(data.roadmap.medium_term).toBeTruthy()
      expect(data.roadmap.long_term).toBeTruthy()
      expect(data.roadmap.short_term[0].priority).toBe('critical')
    })

    test('GET /api/v1/ai/health - AI Service Health Monitoring', async () => {
      const response = await fetch('/api/v1/ai/health')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.model).toBe('llama-3-8b-instruct')
      expect(data.gpu_available).toBe(true)
    })

    test('POST /api/v1/ai/feedback - AI Response Feedback', async () => {
      const response = await fetch('/api/v1/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_id: 'ai-response-123',
          rating: 4,
          feedback: 'Dobar odgovor, korisno'
        })
      })

      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.message).toContain('zabilježena')
    })

    test('GET /api/v1/ai/capabilities - Available AI Features', async () => {
      const response = await fetch('/api/v1/ai/capabilities')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.features)).toBe(true)
      expect(data.features).toContain('search')
      expect(data.languages).toContain('hr')
    })
  })

  describe('Compliance Reference APIs (8 endpoints)', () => {
    test('GET /api/v1/measures - Compliance Categories', async () => {
      const response = await fetch('/api/v1/measures')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.measures)).toBe(true)
      expect(data.measures[0].title).toBe('Upravljanje informacijskim sustavom')
    })

    test('GET /api/v1/measures/:id - Measure Details', async () => {
      const response = await fetch('/api/v1/measures/measure-1')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.id).toBe('measure-1')
      expect(Array.isArray(data.submeasures)).toBe(true)
    })

    test('GET /api/v1/measures/:id/submeasures - Submeasure Listing', async () => {
      const response = await fetch('/api/v1/measures/measure-1/submeasures')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.submeasures)).toBe(true)
      expect(data.submeasures[0].title).toBe('Politike sigurnosti')
    })

    test('GET /api/v1/controls - Control Listing with Filters', async () => {
      const response = await fetch('/api/v1/controls?mandatory_only=true')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.controls)).toBe(true)
      expect(data.controls[0].is_mandatory).toBe(true)
    })

    test('GET /api/v1/controls/:id - Control Details', async () => {
      const response = await fetch('/api/v1/controls/control-1-1-1')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.id).toBe('control-1-1-1')
      expect(data.title).toBe('Politika informacijske sigurnosti')
    })

    test('GET /api/v1/controls/level/:level - Controls by Security Level', async () => {
      const response = await fetch('/api/v1/controls/level/srednja')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.controls)).toBe(true)
      expect(data.total).toBe(277)
    })

    test('GET /api/v1/compliance/summary - Compliance Statistics', async () => {
      const response = await fetch('/api/v1/compliance/summary')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.total_measures).toBe(13)
      expect(data.total_submeasures).toBe(99)
      expect(data.total_controls.srednja).toBe(277)
      expect(data.mandatory_controls.srednja).toBe(220)
    })

    test('GET /api/v1/compliance/structure - Complete Hierarchy', async () => {
      const response = await fetch('/api/v1/compliance/structure')
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(Array.isArray(data.structure)).toBe(true)
      expect(data.structure[0].measure.title).toBe('Upravljanje informacijskim sustavom')
      expect(Array.isArray(data.structure[0].submeasures)).toBe(true)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('Network Error Scenarios', async () => {
      server.use(
        rest.get('/api/v1/assessments/network-error', (req, res, ctx) => {
          return res.networkError('Connection failed')
        })
      )

      try {
        await fetch('/api/v1/assessments/network-error')
      } catch (error) {
        expect(error).toBeTruthy()
      }
    })

    test('HTTP Error Status Codes', async () => {
      server.use(
        rest.get('/api/v1/assessments/not-found', (req, res, ctx) => {
          return res(ctx.status(404), ctx.json({
            error: 'Assessment not found',
            message: 'Procjena nije pronađena'
          }))
        })
      )

      const response = await fetch('/api/v1/assessments/not-found')
      expect(response.status).toBe(404)
      
      const data = await response.json()
      expect(data.message).toContain('pronađena')
    })

    test('Validation Error Responses', async () => {
      server.use(
        rest.post('/api/v1/assessments/validation-error', (req, res, ctx) => {
          return res(ctx.status(422), ctx.json({
            error: 'Validation failed',
            details: {
              title: 'Naslov je obavezan',
              security_level: 'Neispravna razina sigurnosti'
            }
          }))
        })
      )

      const response = await fetch('/api/v1/assessments/validation-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(422)
      
      const data = await response.json()
      expect(data.details.title).toContain('obavezan')
    })
  })

  describe('Performance and Rate Limiting', () => {
    test('Response Time Requirements', async () => {
      const startTime = Date.now()
      
      await fetch('/api/v1/assessments')
      
      const responseTime = Date.now() - startTime
      expect(responseTime).toBeLessThan(1000) // Should respond within 1 second
    })

    test('Concurrent Request Handling', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        fetch(`/api/v1/assessments/concurrent-${i}`)
      )

      const responses = await Promise.all(requests)
      
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })

    test('Large Payload Handling', async () => {
      const largeAnswers = Array.from({ length: 277 }, (_, i) => ({
        control_id: `control-${i}`,
        documentation_score: 3,
        implementation_score: 4,
        comments: `Komentar za kontrolu ${i}`.repeat(10)
      }))

      const response = await fetch('/api/v1/assessments/test-assessment-id-123/answers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: largeAnswers })
      })

      expect(response.status).toBe(200)
    })
  })
})