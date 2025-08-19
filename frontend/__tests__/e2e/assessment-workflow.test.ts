// Comprehensive end-to-end testing for complete assessment workflow
import { test, expect, Page } from '@playwright/test'

// Test configuration
const TEST_CONFIG = {
  baseURL: 'http://localhost:3000',
  timeout: 30000,
  retries: 2
}

// Test data
const ASSESSMENT_DATA = {
  title: 'Test Procjena Kibernetičke Sigurnosti 2024',
  description: 'Detaljno testiranje procjene za ZKS/NIS2 usklađenost',
  security_level: 'srednja' as const,
  organization: 'Test Organizacija d.o.o.'
}

// Helper functions
async function loginUser(page: Page) {
  await page.goto('/hr/login')
  await page.fill('[data-testid="email-input"]', 'test@example.com')
  await page.fill('[data-testid="password-input"]', 'testpassword123')
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('/hr/dashboard')
}

async function createAssessment(page: Page) {
  await page.click('[data-testid="new-assessment-button"]')
  await page.fill('[data-testid="assessment-title"]', ASSESSMENT_DATA.title)
  await page.fill('[data-testid="assessment-description"]', ASSESSMENT_DATA.description)
  await page.selectOption('[data-testid="security-level"]', ASSESSMENT_DATA.security_level)
  await page.click('[data-testid="create-assessment-button"]')
  
  // Wait for assessment creation and navigation
  await page.waitForURL(/\/hr\/assessments\/[a-f0-9-]+\/questionnaire$/)
  
  // Extract assessment ID from URL
  const url = page.url()
  const assessmentId = url.split('/').slice(-2, -1)[0] // Get ID from /assessments/[id]/questionnaire
  
  return assessmentId
}

async function completeControlScoring(page: Page, controlIndex: number = 0) {
  // Navigate to specific control
  await page.click(`[data-testid="control-card-${controlIndex}"]`)
  
  // Fill in scores
  await page.click('[data-testid="documentation-score-4"]')
  await page.click('[data-testid="implementation-score-3"]')
  
  // Add comment
  await page.fill('[data-testid="control-comment"]', 'Test komentar za kontrolu - implementirano prema najbolj možem stvaranju zahtjeva.')
  
  // Save control
  await page.click('[data-testid="save-control"]')
  
  // Wait for save confirmation
  await expect(page.locator('[data-testid="save-status"]')).toContainText('Spremljeno')
}

// Main test suite
test.describe('Assessment Workflow - Complete End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for complex workflows
    test.setTimeout(TEST_CONFIG.timeout)
    
    // Enable request logging
    page.on('request', request => {
      console.log('Request:', request.method(), request.url())
    })
    
    page.on('response', response => {
      if (!response.ok()) {
        console.log('Failed response:', response.status(), response.url())
      }
    })
  })

  test('Complete Assessment Workflow: Creation to Export', async ({ page }) => {
    // Step 1: Login
    await test.step('User Authentication', async () => {
      await loginUser(page)
      
      // Verify dashboard loaded
      await expect(page.locator('[data-testid="dashboard-title"]')).toBeVisible()
      await expect(page.locator('[data-testid="dashboard-title"]')).toContainText('Nadzorna ploča')
    })

    // Step 2: Create Assessment
    let assessmentId: string | undefined
    await test.step('Assessment Creation', async () => {
      assessmentId = await createAssessment(page)
      
      // Verify assessment created
      expect(assessmentId).toBeTruthy()
      await expect(page.locator('[data-testid="assessment-title"]')).toContainText(ASSESSMENT_DATA.title)
      await expect(page.locator('[data-testid="security-level-badge"]')).toContainText('Srednja')
    })

    // Step 3: Navigate Assessment Structure
    await test.step('Assessment Navigation', async () => {
      // Verify 13 measures are present
      const measures = page.locator('[data-testid^="measure-"]')
      await expect(measures).toHaveCount(13)
      
      // Test measure expansion
      await page.click('[data-testid="measure-0"]')
      await expect(page.locator('[data-testid="measure-0-submeasures"]')).toBeVisible()
      
      // Test control visibility
      const controls = page.locator('[data-testid^="control-card-"]')
      await expect(controls.first()).toBeVisible()
    })

    // Step 4: Complete Controls (Sample)
    await test.step('Control Scoring', async () => {
      // Complete first 3 controls to test scoring
      for (let i = 0; i < 3; i++) {
        await completeControlScoring(page, i)
      }
      
      // Verify progress updates
      const progressBar = page.locator('[data-testid="progress-bar"]')
      await expect(progressBar).toBeVisible()
      
      // Check progress percentage increased
      const progressText = await page.locator('[data-testid="progress-text"]').textContent()
      expect(progressText).toMatch(/[1-9]%|[1-9][0-9]%/) // Should be > 0%
    })

    // Step 5: Real-time Score Calculation
    await test.step('Score Calculation', async () => {
      // Check overall score updates
      const overallScore = page.locator('[data-testid="overall-score"]')
      await expect(overallScore).toBeVisible()
      
      // Check measure-specific scores
      const measureScore = page.locator('[data-testid="measure-0-score"]')
      await expect(measureScore).toBeVisible()
      
      // Verify Croatian number formatting
      const scoreText = await measureScore.textContent()
      expect(scoreText).toMatch(/\d+[,.]?\d*/) // Croatian decimal format
    })

    // Step 6: AI Integration Testing
    await test.step('AI Features', async () => {
      // Test AI help for control
      await page.click('[data-testid="control-card-0"]')
      await page.click('[data-testid="ai-help-button"]')
      
      // Wait for AI response
      await expect(page.locator('[data-testid="ai-help-panel"]')).toBeVisible()
      
      // Test AI question
      await page.fill('[data-testid="ai-question-input"]', 'Kako implementirati ovu kontrolu?')
      await page.click('[data-testid="ask-ai-button"]')
      
      // Wait for AI response (may take longer)
      await expect(page.locator('[data-testid="ai-response"]')).toBeVisible({ timeout: 10000 })
    })

    // Step 7: Results and Analysis
    await test.step('Results Analysis', async () => {
      // Navigate to results
      await page.click('[data-testid="view-results-button"]')
      await page.waitForURL(/\/hr\/assessments\/[a-f0-9-]+\/results$/)
      
      // Test tab navigation
      const tabs = ['overview', 'gaps', 'recommendations', 'roadmap', 'export']
      for (const tab of tabs) {
        await page.click(`[data-testid="tab-${tab}"]`)
        await expect(page.locator(`[data-testid="${tab}-content"]`)).toBeVisible()
      }
    })

    // Step 8: Gap Analysis
    await test.step('Gap Analysis', async () => {
      await page.click('[data-testid="tab-gaps"]')
      
      // Verify gap analysis charts
      await expect(page.locator('[data-testid="gap-chart"]')).toBeVisible()
      await expect(page.locator('[data-testid="priority-matrix"]')).toBeVisible()
      
      // Test Croatian labels
      await expect(page.locator('[data-testid="gap-high-priority"]')).toContainText('Visoki prioritet')
    })

    // Step 9: AI Recommendations
    await test.step('AI Recommendations', async () => {
      await page.click('[data-testid="tab-recommendations"]')
      
      // Wait for AI recommendations to load
      await expect(page.locator('[data-testid="recommendations-list"]')).toBeVisible()
      
      // Verify Croatian recommendations
      const recommendations = page.locator('[data-testid^="recommendation-"]')
      await expect(recommendations.first()).toBeVisible()
    })

    // Step 10: Improvement Roadmap
    await test.step('Improvement Roadmap', async () => {
      await page.click('[data-testid="tab-roadmap"]')
      
      // Wait for roadmap generation
      await expect(page.locator('[data-testid="roadmap-timeline"]')).toBeVisible()
      
      // Test timeline periods
      const periods = ['short-term', 'medium-term', 'long-term']
      for (const period of periods) {
        await expect(page.locator(`[data-testid="roadmap-${period}"]`)).toBeVisible()
      }
    })

    // Step 11: Export Functionality
    await test.step('Export Testing', async () => {
      await page.click('[data-testid="tab-export"]')
      
      // Test PDF export
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('[data-testid="export-pdf-button"]')
      ])
      
      expect(download.suggestedFilename()).toMatch(/\.pdf$/)
      
      // Test Excel export
      const [excelDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('[data-testid="export-excel-button"]')
      ])
      
      expect(excelDownload.suggestedFilename()).toMatch(/\.xlsx$/)
    })

    // Step 12: Assessment Submission
    await test.step('Assessment Submission', async () => {
      // Navigate back to assessment questionnaire
      await page.goto(`/hr/assessments/${assessmentId}/questionnaire`)
      
      // Submit assessment
      await page.click('[data-testid="submit-assessment-button"]')
      
      // Confirm submission dialog
      await expect(page.locator('[data-testid="submit-confirmation-dialog"]')).toBeVisible()
      await page.click('[data-testid="confirm-submit-button"]')
      
      // Verify submission success
      await expect(page.locator('[data-testid="submission-success"]')).toBeVisible()
      await expect(page.locator('[data-testid="assessment-status"]')).toContainText('Poslano')
    })
  })

  test('Croatian Language Support', async ({ page }) => {
    await test.step('Language Switching', async () => {
      await loginUser(page)
      
      // Switch to English
      await page.click('[data-testid="language-switcher"]')
      await page.click('[data-testid="language-en"]')
      
      // Verify English content
      await expect(page.locator('[data-testid="dashboard-title"]')).toContainText('Dashboard')
      
      // Switch back to Croatian
      await page.click('[data-testid="language-switcher"]')
      await page.click('[data-testid="language-hr"]')
      
      // Verify Croatian content
      await expect(page.locator('[data-testid="dashboard-title"]')).toContainText('Nadzorna ploča')
    })

    await test.step('Croatian Character Handling', async () => {
      const assessmentId = await createAssessment(page)
      
      // Test Croatian characters in comments
      await page.click('[data-testid="control-card-0"]')
      const croatianText = 'Ova kontrola zahtijeva pojašnjenje oko implementacije šifiranja podataka. Preporučujem korištenje AES-256 algoritma za najbolju zaštitu.'
      
      await page.fill('[data-testid="control-comment"]', croatianText)
      await page.click('[data-testid="save-control"]')
      
      // Verify Croatian text persisted correctly
      await page.reload()
      await page.click('[data-testid="control-card-0"]')
      const savedText = await page.inputValue('[data-testid="control-comment"]')
      expect(savedText).toBe(croatianText)
    })
  })

  test('Mobile Responsiveness', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await test.step('Mobile Navigation', async () => {
      await loginUser(page)
      
      // Test mobile menu
      await page.click('[data-testid="mobile-menu-button"]')
      await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()
      
      // Test navigation
      await page.click('[data-testid="mobile-assessments-link"]')
      await expect(page.locator('[data-testid="assessments-list"]')).toBeVisible()
    })

    await test.step('Mobile Assessment Interface', async () => {
      const assessmentId = await createAssessment(page)
      
      // Test mobile control cards
      const controlCard = page.locator('[data-testid="control-card-0"]')
      await expect(controlCard).toBeVisible()
      
      // Test mobile scoring interface
      await controlCard.click()
      await expect(page.locator('[data-testid="mobile-scoring-panel"]')).toBeVisible()
      
      // Test touch interactions
      await page.tap('[data-testid="documentation-score-4"]')
      await page.tap('[data-testid="implementation-score-3"]')
      
      // Verify scores saved
      await page.click('[data-testid="save-control"]')
      await expect(page.locator('[data-testid="save-status"]')).toContainText('Spremljeno')
    })
  })

  test('Performance Testing', async ({ page }) => {
    await test.step('Large Assessment Performance', async () => {
      await loginUser(page)
      
      // Create assessment with maximum security level (277 controls)
      await page.click('[data-testid="new-assessment-button"]')
      await page.fill('[data-testid="assessment-title"]', 'Performance Test - Napredna Razina')
      await page.selectOption('[data-testid="security-level"]', 'napredna')
      
      // Measure creation time
      const startTime = Date.now()
      await page.click('[data-testid="create-assessment-button"]')
      await page.waitForURL(/\/hr\/assessments\/[a-f0-9-]+\/questionnaire$/)
      const creationTime = Date.now() - startTime
      
      expect(creationTime).toBeLessThan(5000) // Should load within 5 seconds
      
      // Test navigation performance
      const navStartTime = Date.now()
      await page.click('[data-testid="measure-0"]')
      await expect(page.locator('[data-testid="measure-0-submeasures"]')).toBeVisible()
      const navTime = Date.now() - navStartTime
      
      expect(navTime).toBeLessThan(1000) // Navigation should be under 1 second
    })

    await test.step('Memory Usage Monitoring', async () => {
      // Monitor memory usage during intensive operations
      const metrics = await page.evaluate(() => {
        return {
          usedJSHeapSize: (performance as any).memory?.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory?.totalJSHeapSize
        }
      })
      
      console.log('Memory metrics:', metrics)
      
      // Memory usage shouldn't exceed reasonable limits
      if (metrics.usedJSHeapSize) {
        expect(metrics.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024) // 100MB
      }
    })
  })

  test('Error Handling and Recovery', async ({ page }) => {
    await test.step('Network Error Handling', async () => {
      await loginUser(page)
      
      // Simulate network failure
      await page.route('**/api/v1/assessments', route => {
        route.abort('connectionrefused')
      })
      
      await page.click('[data-testid="new-assessment-button"]')
      await page.fill('[data-testid="assessment-title"]', 'Test Assessment')
      await page.click('[data-testid="create-assessment-button"]')
      
      // Verify error handling
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible()
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Greška u komunikaciji sa serverom')
      
      // Test retry mechanism
      await page.unroute('**/api/v1/assessments')
      await page.click('[data-testid="retry-button"]')
      
      // Should succeed after retry
      await page.waitForURL(/\/hr\/assessments\/[a-f0-9-]+\/questionnaire$/)
    })

    await test.step('Validation Error Handling', async () => {
      const assessmentId = await createAssessment(page)
      
      // Try to save invalid score
      await page.click('[data-testid="control-card-0"]')
      
      // Try to submit without required fields
      await page.click('[data-testid="save-control"]')
      
      // Verify validation messages in Croatian
      await expect(page.locator('[data-testid="validation-error"]')).toContainText('Potrebno je unijeti barem jednu ocjenu')
    })
  })

  test('Accessibility Testing', async ({ page }) => {
    await test.step('Keyboard Navigation', async () => {
      await loginUser(page)
      
      // Test keyboard navigation through assessment creation
      await page.keyboard.press('Tab') // Focus new assessment button
      await page.keyboard.press('Enter') // Open modal
      
      await page.keyboard.type(ASSESSMENT_DATA.title)
      await page.keyboard.press('Tab') // Move to description
      await page.keyboard.type(ASSESSMENT_DATA.description)
      
      // Navigate through form with keyboard
      await page.keyboard.press('Tab') // Move to security level
      await page.keyboard.press('ArrowDown') // Select srednja
      await page.keyboard.press('Tab') // Move to create button
      await page.keyboard.press('Enter') // Create assessment
      
      await page.waitForURL(/\/hr\/assessments\/[a-f0-9-]+\/questionnaire$/)
    })

    await test.step('Screen Reader Compatibility', async () => {
      // Test ARIA labels and roles
      await expect(page.locator('[role="main"]')).toBeVisible()
      await expect(page.locator('[aria-label="Navigacija glavnog izbornika"]')).toBeVisible()
      
      // Test form labels
      await page.click('[data-testid="new-assessment-button"]')
      await expect(page.locator('label[for="assessment-title"]')).toBeVisible()
      await expect(page.locator('label[for="assessment-description"]')).toBeVisible()
    })
  })
})

// Utility for test data cleanup
test.afterEach(async ({ page }) => {
  // Clean up any test data if needed
  await page.evaluate(() => {
    // Clear local storage test data
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('test_')) {
        localStorage.removeItem(key)
      }
    })
  })
})