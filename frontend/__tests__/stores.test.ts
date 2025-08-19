/**
 * Tests for Zustand stores
 */

import { useAuthStore } from '@/stores/auth-store'
import { useAssessmentStore } from '@/stores/assessment-store'
import { useUIStore } from '@/stores/ui-store'
import type { User, Assessment } from '@/types/api'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('Auth Store', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
  })

  test('should set user and update authentication state', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      created_at: '2024-01-01',
      updated_at: '2024-01-01'
    }

    useAuthStore.getState().setUser(mockUser)
    
    const state = useAuthStore.getState()
    expect(state.currentUser).toEqual(mockUser)
    expect(state.isAuthenticated).toBe(true)
  })

  test('should logout and clear user state', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      created_at: '2024-01-01',
      updated_at: '2024-01-01'
    }

    useAuthStore.getState().setUser(mockUser)
    useAuthStore.getState().logout()
    
    const state = useAuthStore.getState()
    expect(state.currentUser).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })
})

describe('Assessment Store', () => {
  beforeEach(() => {
    useAssessmentStore.getState().clearAssessmentData()
  })

  test('should set current assessment', () => {
    const mockAssessment: Assessment = {
      id: 'assessment-123',
      title: 'Test Assessment',
      security_level: 'srednja',
      status: 'draft',
      progress_percentage: 0,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      created_by: 'user-123',
      organization_id: 'org-123'
    }

    useAssessmentStore.getState().setCurrentAssessment(mockAssessment)
    
    const state = useAssessmentStore.getState()
    expect(state.currentAssessment).toEqual(mockAssessment)
  })

  test('should update answer for control', () => {
    const controlId = 'control-123'
    const answer = {
      documentation_score: 4,
      implementation_score: 3,
      comments: 'Test comment'
    }

    useAssessmentStore.getState().updateAnswer(controlId, answer)
    
    const state = useAssessmentStore.getState()
    expect(state.currentAnswers[controlId]).toMatchObject(answer)
    expect(state.currentAnswers[controlId].control_id).toBe(controlId)
  })

  test('should get answer for control', () => {
    const controlId = 'control-123'
    const answer = {
      documentation_score: 4,
      implementation_score: 3,
      comments: 'Test comment'
    }

    useAssessmentStore.getState().updateAnswer(controlId, answer)
    
    const retrievedAnswer = useAssessmentStore.getState().getAnswerForControl(controlId)
    expect(retrievedAnswer).toMatchObject(answer)
  })

  test('should update navigation state', () => {
    const navState = {
      currentMeasureIndex: 2,
      currentControlIndex: 5,
      totalControls: 277
    }

    useAssessmentStore.getState().setNavigationState(navState)
    
    const state = useAssessmentStore.getState()
    expect(state.navigationState.currentMeasureIndex).toBe(2)
    expect(state.navigationState.currentControlIndex).toBe(5)
    expect(state.navigationState.totalControls).toBe(277)
  })

  test('should clear assessment data', () => {
    // First set some data
    const mockAssessment: Assessment = {
      id: 'assessment-123',
      title: 'Test Assessment',
      security_level: 'srednja',
      status: 'draft',
      progress_percentage: 0,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      created_by: 'user-123',
      organization_id: 'org-123'
    }

    useAssessmentStore.getState().setCurrentAssessment(mockAssessment)
    useAssessmentStore.getState().updateAnswer('control-1', { documentation_score: 4 })
    
    // Clear data
    useAssessmentStore.getState().clearAssessmentData()
    
    const state = useAssessmentStore.getState()
    expect(state.currentAssessment).toBeNull()
    expect(state.currentAnswers).toEqual({})
    expect(state.navigationState.currentMeasureIndex).toBe(0)
    expect(state.navigationState.currentControlIndex).toBe(0)
  })
})

describe('UI Store', () => {
  beforeEach(() => {
    // Reset to default state
    const state = useUIStore.getState()
    state.closeAllModals()
    state.setSidebarOpen(true)
    state.setTheme('light')
    state.setLanguage('hr')
  })

  test('should toggle sidebar state', () => {
    useUIStore.getState().setSidebarOpen(false)
    expect(useUIStore.getState().sidebarOpen).toBe(false)
    
    useUIStore.getState().setSidebarOpen(true)
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })

  test('should update theme', () => {
    useUIStore.getState().setTheme('dark')
    expect(useUIStore.getState().theme).toBe('dark')
  })

  test('should update language', () => {
    useUIStore.getState().setLanguage('en')
    expect(useUIStore.getState().language).toBe('en')
  })

  test('should update preferences', () => {
    const newPreferences = {
      autoSave: false,
      showTooltips: false,
      compactMode: true
    }

    useUIStore.getState().updatePreferences(newPreferences)
    
    const state = useUIStore.getState()
    expect(state.preferences.autoSave).toBe(false)
    expect(state.preferences.showTooltips).toBe(false)
    expect(state.preferences.compactMode).toBe(true)
    expect(state.preferences.showProgress).toBe(true) // Should remain unchanged
  })

  test('should open and close modals', () => {
    useUIStore.getState().openModal('createAssessment')
    expect(useUIStore.getState().modals.createAssessment).toBe(true)
    
    useUIStore.getState().closeModal('createAssessment')
    expect(useUIStore.getState().modals.createAssessment).toBe(false)
  })

  test('should close all modals', () => {
    // Open multiple modals
    useUIStore.getState().openModal('createAssessment')
    useUIStore.getState().openModal('exportOptions')
    useUIStore.getState().openModal('aiHelp')
    
    // Close all
    useUIStore.getState().closeAllModals()
    
    const state = useUIStore.getState()
    expect(state.modals.createAssessment).toBe(false)
    expect(state.modals.exportOptions).toBe(false)
    expect(state.modals.aiHelp).toBe(false)
    expect(state.modals.deleteConfirm).toBe(false)
  })
})