import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Assessment, AssessmentAnswer } from '@/types/api'

interface AssessmentState {
  currentAssessment: Assessment | null
  currentAnswers: Record<string, AssessmentAnswer>
  navigationState: {
    currentMeasureIndex: number
    currentControlIndex: number
    totalMeasures: number
    totalControls: number
  }
  setCurrentAssessment: (assessment: Assessment | null) => void
  updateAnswer: (controlId: string, answer: Partial<AssessmentAnswer>) => void
  setNavigationState: (state: Partial<AssessmentState['navigationState']>) => void
  clearAssessmentData: () => void
  getAnswerForControl: (controlId: string) => AssessmentAnswer | undefined
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set, get) => ({
      currentAssessment: null,
      currentAnswers: {},
      navigationState: {
        currentMeasureIndex: 0,
        currentControlIndex: 0,
        totalMeasures: 13,
        totalControls: 0,
      },
      setCurrentAssessment: (assessment) => set({ 
        currentAssessment: assessment 
      }),
      updateAnswer: (controlId, answer) => set((state) => ({
        currentAnswers: {
          ...state.currentAnswers,
          [controlId]: {
            ...state.currentAnswers[controlId],
            ...answer,
            control_id: controlId,
            assessment_id: state.currentAssessment?.id || '',
          } as AssessmentAnswer
        }
      })),
      setNavigationState: (navState) => set((state) => ({
        navigationState: {
          ...state.navigationState,
          ...navState
        }
      })),
      clearAssessmentData: () => set({
        currentAssessment: null,
        currentAnswers: {},
        navigationState: {
          currentMeasureIndex: 0,
          currentControlIndex: 0,
          totalMeasures: 13,
          totalControls: 0,
        }
      }),
      getAnswerForControl: (controlId) => {
        const state = get()
        return state.currentAnswers[controlId]
      },
    }),
    {
      name: 'assessment-storage',
      partialize: (state) => ({
        currentAssessment: state.currentAssessment,
        currentAnswers: state.currentAnswers,
        navigationState: state.navigationState,
      }),
    }
  )
)