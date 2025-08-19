// Comprehensive performance testing for Croatian cybersecurity assessment platform
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { performance } from 'perf_hooks'

// Performance benchmarks
const PERFORMANCE_THRESHOLDS = {
  INITIAL_LOAD: 3000, // 3 seconds
  NAVIGATION: 1000, // 1 second
  API_RESPONSE: 2000, // 2 seconds
  SCORE_CALCULATION: 500, // 500ms
  AI_RESPONSE: 5000, // 5 seconds
  EXPORT_GENERATION: 10000, // 10 seconds
  MEMORY_USAGE: 100 * 1024 * 1024, // 100MB
  BUNDLE_SIZE: 5 * 1024 * 1024 // 5MB
}

// Mock large dataset simulation
function generateLargeAssessment() {
  return {
    id: 'large-assessment-test',
    title: 'Performance Test Assessment - Napredna Razina',
    security_level: 'napredna',
    measures: Array.from({ length: 13 }, (_, measureIndex) => ({
      id: `measure-${measureIndex + 1}`,
      title: `Mjera ${measureIndex + 1}`,
      submeasures: Array.from({ length: 8 }, (_, submeasureIndex) => ({
        id: `submeasure-${measureIndex + 1}-${submeasureIndex + 1}`,
        title: `Podmjera ${measureIndex + 1}.${submeasureIndex + 1}`,
        controls: Array.from({ length: 3 }, (_, controlIndex) => ({
          id: `control-${measureIndex + 1}-${submeasureIndex + 1}-${controlIndex + 1}`,
          title: `Kontrola ${measureIndex + 1}.${submeasureIndex + 1}.${controlIndex + 1}`,
          description: `Detaljni opis kontrole kibernetičke sigurnosti za upravljanje rizicima i zaštitu informacijskih sustava organizacije. Ova kontrola zahtijeva implementaciju specifičnih tehničkih i organizacijskih mjera u skladu s propisima ZKS i NIS2 direktive.`.repeat(5),
          is_mandatory: controlIndex % 2 === 0,
          documentation_score: null,
          implementation_score: null,
          comments: '',
          evidence_files: []
        }))
      }))
    }))
  }
}

// Performance measurement utilities
class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map()

  startMeasurement(label: string): () => number {
    const startTime = performance.now()
    
    return () => {
      const duration = performance.now() - startTime
      
      if (!this.measurements.has(label)) {
        this.measurements.set(label, [])
      }
      this.measurements.get(label)!.push(duration)
      
      return duration
    }
  }

  getStats(label: string) {
    const times = this.measurements.get(label) || []
    if (times.length === 0) return null

    const sorted = [...times].sort((a, b) => a - b)
    const avg = times.reduce((sum, time) => sum + time, 0) / times.length
    const median = sorted[Math.floor(sorted.length / 2)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const min = sorted[0]
    const max = sorted[sorted.length - 1]

    return { avg, median, p95, min, max, count: times.length }
  }

  reset() {
    this.measurements.clear()
  }
}

describe('Performance Testing', () => {
  let monitor: PerformanceMonitor

  beforeEach(() => {
    monitor = new PerformanceMonitor()
  })

  describe('Component Rendering Performance', () => {
    test('Assessment list renders within performance threshold', async () => {
      const assessments = Array.from({ length: 100 }, (_, index) => ({
        id: `assessment-${index}`,
        title: `Procjena kibernetičke sigurnosti ${index + 1}`,
        description: `Detaljni opis procjene usklađenosti za organizaciju ${index + 1}`,
        security_level: ['osnovna', 'srednja', 'napredna'][index % 3],
        status: ['draft', 'in_progress', 'completed'][index % 3],
        created_at: new Date(Date.now() - index * 86400000).toISOString(),
        updated_at: new Date(Date.now() - index * 43200000).toISOString(),
        completion_percentage: Math.floor(Math.random() * 100)
      }))

      const endMeasurement = monitor.startMeasurement('assessment-list-render')

      // Simulate component rendering with large dataset
      const startTime = performance.now()
      
      // Mock React component rendering
      const renderTime = await new Promise<number>((resolve) => {
        setTimeout(() => {
          // Simulate DOM manipulation and state updates
          const element = document.createElement('div')
          element.innerHTML = assessments.map(assessment => 
            `<div class="assessment-card">
              <h3>${assessment.title}</h3>
              <p>${assessment.description}</p>
              <span class="status">${assessment.status}</span>
              <span class="progress">${assessment.completion_percentage}%</span>
            </div>`
          ).join('')
          
          resolve(performance.now() - startTime)
        }, 50)
      })

      const totalTime = endMeasurement()

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.NAVIGATION)
      expect(renderTime).toBeLessThan(500) // DOM manipulation should be fast
    })

    test('Large questionnaire navigation performance', async () => {
      const largeAssessment = generateLargeAssessment()
      const totalControls = largeAssessment.measures.reduce((total, measure) => 
        total + measure.submeasures.reduce((subTotal, submeasure) => 
          subTotal + submeasure.controls.length, 0), 0)

      expect(totalControls).toBe(312) // 13 measures × 8 submeasures × 3 controls

      const endMeasurement = monitor.startMeasurement('questionnaire-navigation')

      // Simulate navigation through all measures
      for (const measure of largeAssessment.measures) {
        const measureStartTime = performance.now()
        
        // Simulate measure expansion and control loading
        await new Promise(resolve => setTimeout(resolve, 10))
        
        for (const submeasure of measure.submeasures) {
          // Simulate submeasure loading
          await new Promise(resolve => setTimeout(resolve, 5))
          
          // Simulate control card rendering
          submeasure.controls.forEach(control => {
            // Mock control state update
            control.documentation_score = Math.floor(Math.random() * 5) + 1
            control.implementation_score = Math.floor(Math.random() * 5) + 1
          })
        }
        
        const measureTime = performance.now() - measureStartTime
        expect(measureTime).toBeLessThan(200) // Each measure should load quickly
      }

      const totalNavigationTime = endMeasurement()
      expect(totalNavigationTime).toBeLessThan(PERFORMANCE_THRESHOLDS.NAVIGATION * 2) // Allow more time for large dataset
    })

    test('Real-time score calculation performance', async () => {
      const largeAssessment = generateLargeAssessment()
      
      // Simulate score calculation for all controls
      const endMeasurement = monitor.startMeasurement('score-calculation')
      
      const calculateScores = () => {
        let totalDocumentationScore = 0
        let totalImplementationScore = 0
        let totalControls = 0
        let completedControls = 0

        largeAssessment.measures.forEach(measure => {
          measure.submeasures.forEach(submeasure => {
            submeasure.controls.forEach(control => {
              totalControls++
              
              if (control.documentation_score && control.implementation_score) {
                totalDocumentationScore += control.documentation_score
                totalImplementationScore += control.implementation_score
                completedControls++
              }
            })
          })
        })

        const avgDocScore = completedControls > 0 ? totalDocumentationScore / completedControls : 0
        const avgImplScore = completedControls > 0 ? totalImplementationScore / completedControls : 0
        const overallScore = (avgDocScore + avgImplScore) / 2
        const completionPercentage = (completedControls / totalControls) * 100

        return {
          overallScore,
          completionPercentage,
          totalControls,
          completedControls,
          avgDocumentationScore: avgDocScore,
          avgImplementationScore: avgImplScore
        }
      }

      // Perform multiple calculations to test performance
      const iterations = 100
      for (let i = 0; i < iterations; i++) {
        // Randomly update some scores
        const randomMeasure = largeAssessment.measures[Math.floor(Math.random() * largeAssessment.measures.length)]
        const randomSubmeasure = randomMeasure.submeasures[Math.floor(Math.random() * randomMeasure.submeasures.length)]
        const randomControl = randomSubmeasure.controls[Math.floor(Math.random() * randomSubmeasure.controls.length)]
        
        randomControl.documentation_score = Math.floor(Math.random() * 5) + 1
        randomControl.implementation_score = Math.floor(Math.random() * 5) + 1

        const scores = calculateScores()
        
        expect(scores.overallScore).toBeGreaterThanOrEqual(0)
        expect(scores.overallScore).toBeLessThanOrEqual(5)
        expect(scores.completionPercentage).toBeGreaterThanOrEqual(0)
        expect(scores.completionPercentage).toBeLessThanOrEqual(100)
      }

      const calculationTime = endMeasurement()
      expect(calculationTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SCORE_CALCULATION)
    })
  })

  describe('API Performance', () => {
    test('Assessment creation API performance', async () => {
      const endMeasurement = monitor.startMeasurement('api-assessment-creation')

      // Mock API call
      const mockApiCall = async () => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              id: 'created-assessment-123',
              title: 'Nova procjena kibernetičke sigurnosti',
              status: 'draft',
              created_at: new Date().toISOString()
            })
          }, 150) // Simulate 150ms API response
        })
      }

      const result = await mockApiCall()
      const apiTime = endMeasurement()

      expect(apiTime).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE / 4) // Should be much faster than threshold
      expect(result).toBeTruthy()
    })

    test('Bulk answer submission performance', async () => {
      const largeAnswerSet = Array.from({ length: 277 }, (_, index) => ({
        control_id: `control-${Math.floor(index / 10) + 1}-${Math.floor((index % 10) / 3) + 1}-${(index % 3) + 1}`,
        documentation_score: Math.floor(Math.random() * 5) + 1,
        implementation_score: Math.floor(Math.random() * 5) + 1,
        comments: `Komentar za kontrolu ${index + 1} - implementirano prema najboljim praksama kibernetičke sigurnosti.`,
        evidence_files: index % 5 === 0 ? [`evidence-${index}.pdf`] : []
      }))

      const endMeasurement = monitor.startMeasurement('bulk-answer-submission')

      // Mock bulk submission
      const mockBulkSubmission = async (answers: any[]) => {
        const batchSize = 50
        const batches = []
        
        for (let i = 0; i < answers.length; i += batchSize) {
          batches.push(answers.slice(i, i + batchSize))
        }

        const results = await Promise.all(
          batches.map(async (batch, index) => {
            // Simulate API call for each batch
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 50))
            return { batch: index, processed: batch.length }
          })
        )

        return results
      }

      const results = await mockBulkSubmission(largeAnswerSet)
      const submissionTime = endMeasurement()

      expect(submissionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.API_RESPONSE * 2) // Allow extra time for bulk operation
      expect(results.length).toBeGreaterThan(0)
      
      const totalProcessed = results.reduce((sum, result) => sum + result.processed, 0)
      expect(totalProcessed).toBe(277)
    })

    test('AI service response time performance', async () => {
      const aiQueries = [
        'Kako implementirati MFA u organizaciji?',
        'Što zahtijeva ZKS uredba za sigurnosne kopije?',
        'Kakav je postupak za upravljanje incidentima?',
        'Kako provoditi procjenu rizika informacijske sigurnosti?',
        'Što je potrebno za usklađenost s NIS2 direktivom?'
      ]

      for (const query of aiQueries) {
        const endMeasurement = monitor.startMeasurement('ai-response')

        // Mock AI service call
        const mockAIResponse = async (question: string) => {
          // Simulate AI processing time based on question complexity
          const processingTime = 800 + Math.random() * 400 // 800-1200ms
          
          await new Promise(resolve => setTimeout(resolve, processingTime))
          
          return {
            answer: `Odgovor na pitanje: "${question}". Za implementaciju se preporučuje sljedeći pristup...`,
            sources: [
              { title: 'ZKS Uredba', confidence: 0.92 },
              { title: 'ISO 27001', confidence: 0.85 }
            ],
            confidence: 0.89
          }
        }

        const response = await mockAIResponse(query)
        const responseTime = endMeasurement()

        expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.AI_RESPONSE / 2) // AI should respond quickly in test
        expect(response.answer).toContain('Odgovor na pitanje')
        expect(response.confidence).toBeGreaterThan(0.8)
      }

      const aiStats = monitor.getStats('ai-response')
      expect(aiStats?.avg).toBeLessThan(1500) // Average response time should be reasonable
    })
  })

  describe('Memory Usage Performance', () => {
    test('Memory usage with large dataset remains within limits', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0

      // Create multiple large assessments
      const largeDatasets = Array.from({ length: 10 }, () => generateLargeAssessment())
      
      // Simulate component mounting and data processing
      const processedData = largeDatasets.map(assessment => {
        // Simulate component state updates
        const processedMeasures = assessment.measures.map(measure => ({
          ...measure,
          score: Math.random() * 5,
          completionPercentage: Math.random() * 100,
          submeasures: measure.submeasures.map(submeasure => ({
            ...submeasure,
            score: Math.random() * 5,
            controls: submeasure.controls.map(control => ({
              ...control,
              documentation_score: Math.floor(Math.random() * 5) + 1,
              implementation_score: Math.floor(Math.random() * 5) + 1,
              comments: `Ažurirani komentar za kontrolu ${control.id}`
            }))
          }))
        }))

        return { ...assessment, measures: processedMeasures }
      })

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0
      const memoryIncrease = finalMemory - initialMemory

      expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_USAGE)
      expect(processedData.length).toBe(10)
    })

    test('Memory cleanup after component unmounting', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0

      // Simulate component lifecycle
      const componentData = Array.from({ length: 50 }, () => generateLargeAssessment())
      
      // Simulate component processing
      const processedData = componentData.map(assessment => ({
        ...assessment,
        cached: true,
        lastAccessed: Date.now()
      }))

      const peakMemory = (performance as any).memory?.usedJSHeapSize || 0

      // Simulate component cleanup
      processedData.length = 0 // Clear references
      
      // Force garbage collection simulation
      if (global.gc) {
        global.gc()
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0
      const memoryAfterCleanup = finalMemory - initialMemory

      // Memory should be mostly cleaned up
      expect(memoryAfterCleanup).toBeLessThan((peakMemory - initialMemory) * 0.5)
    })
  })

  describe('Concurrent User Simulation', () => {
    test('Handles multiple simultaneous operations', async () => {
      const concurrentOperations = [
        'assessment-creation',
        'score-calculation',
        'ai-query',
        'results-generation',
        'export-preparation'
      ]

      const endMeasurement = monitor.startMeasurement('concurrent-operations')

      // Simulate concurrent operations
      const operations = concurrentOperations.map(async (operation, index) => {
        const operationStart = performance.now()
        
        switch (operation) {
          case 'assessment-creation':
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100))
            break
          case 'score-calculation':
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 50))
            break
          case 'ai-query':
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400))
            break
          case 'results-generation':
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200))
            break
          case 'export-preparation':
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300))
            break
        }

        const operationTime = performance.now() - operationStart
        return { operation, time: operationTime, index }
      })

      const results = await Promise.all(operations)
      const totalTime = endMeasurement()

      // All operations should complete
      expect(results.length).toBe(5)
      
      // Total time should be close to the longest operation (due to concurrency)
      const longestOperation = Math.max(...results.map(r => r.time))
      expect(totalTime).toBeLessThan(longestOperation + 200) // Small overhead allowed
      
      // No operation should take too long
      results.forEach(result => {
        expect(result.time).toBeLessThan(2000)
      })
    })

    test('Performance degradation under load', async () => {
      const loadLevels = [1, 5, 10, 20, 50]
      const performanceResults: any[] = []

      for (const load of loadLevels) {
        const endMeasurement = monitor.startMeasurement(`load-test-${load}`)

        // Simulate concurrent users
        const userOperations = Array.from({ length: load }, async (_, userIndex) => {
          const userStartTime = performance.now()
          
          // Each user performs multiple operations
          await Promise.all([
            new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 50)), // Navigation
            new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100)), // Data loading
            new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 75))   // UI updates
          ])
          
          return performance.now() - userStartTime
        })

        const userTimes = await Promise.all(userOperations)
        const totalLoadTime = endMeasurement()

        const avgUserTime = userTimes.reduce((sum, time) => sum + time, 0) / userTimes.length
        const maxUserTime = Math.max(...userTimes)

        performanceResults.push({
          load,
          totalTime: totalLoadTime,
          avgUserTime,
          maxUserTime,
          throughput: load / (totalLoadTime / 1000) // Users per second
        })

        // Performance should degrade gracefully
        if (performanceResults.length > 1) {
          const previous = performanceResults[performanceResults.length - 2]
          const current = performanceResults[performanceResults.length - 1]
          
          // Response time shouldn't increase more than 50% per 5x load increase
          const loadIncrease = current.load / previous.load
          const timeIncrease = current.avgUserTime / previous.avgUserTime
          
          if (loadIncrease >= 5) {
            expect(timeIncrease).toBeLessThan(1.5)
          }
        }
      }

      // Log performance results for analysis
      console.table(performanceResults)
    })
  })

  describe('Bundle Size and Loading Performance', () => {
    test('Component lazy loading effectiveness', async () => {
      const components = [
        'ResultsDashboard',
        'GapAnalysis', 
        'RecommendationsPanel',
        'ExportPanel',
        'ImprovementRoadmap'
      ]

      const loadingTimes: any[] = []

      for (const component of components) {
        const endMeasurement = monitor.startMeasurement(`lazy-load-${component}`)

        // Simulate lazy loading
        const mockLazyLoad = async () => {
          // Simulate network fetch for component bundle
          const bundleSize = 50000 + Math.random() * 30000 // 50-80KB
          const networkSpeed = 1000 * 1024 // 1MB/s simulation
          const loadTime = (bundleSize / networkSpeed) * 1000

          await new Promise(resolve => setTimeout(resolve, loadTime))
          
          return { component, bundleSize, loadTime }
        }

        const result = await mockLazyLoad()
        const totalTime = endMeasurement()

        loadingTimes.push({
          component: result.component,
          bundleSize: result.bundleSize,
          loadTime: totalTime
        })

        // Each component should load reasonably fast
        expect(totalTime).toBeLessThan(500) // 500ms max for component loading
      }

      // Calculate total bundle size
      const totalBundleSize = loadingTimes.reduce((sum, item) => sum + item.bundleSize, 0)
      expect(totalBundleSize).toBeLessThan(PERFORMANCE_THRESHOLDS.BUNDLE_SIZE / 2) // Should be much smaller than threshold
    })
  })

  afterEach(() => {
    // Log performance stats for analysis
    const allLabels = Array.from(monitor.measurements.keys())
    allLabels.forEach(label => {
      const stats = monitor.getStats(label)
      if (stats) {
        console.log(`Performance stats for ${label}:`, stats)
      }
    })
  })
})