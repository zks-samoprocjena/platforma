import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  language: 'hr' | 'en'
  preferences: {
    autoSave: boolean
    showTooltips: boolean
    compactMode: boolean
    showProgress: boolean
  }
  modals: {
    createAssessment: boolean
    exportOptions: boolean
    deleteConfirm: boolean
    aiHelp: boolean
  }
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
  setLanguage: (language: 'hr' | 'en') => void
  updatePreferences: (preferences: Partial<UIState['preferences']>) => void
  openModal: (modal: keyof UIState['modals']) => void
  closeModal: (modal: keyof UIState['modals']) => void
  closeAllModals: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'light',
      language: 'hr',
      preferences: {
        autoSave: true,
        showTooltips: true,
        compactMode: false,
        showProgress: true,
      },
      modals: {
        createAssessment: false,
        exportOptions: false,
        deleteConfirm: false,
        aiHelp: false,
      },
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      updatePreferences: (newPreferences) => set((state) => ({
        preferences: { ...state.preferences, ...newPreferences }
      })),
      openModal: (modal) => set((state) => ({
        modals: { ...state.modals, [modal]: true }
      })),
      closeModal: (modal) => set((state) => ({
        modals: { ...state.modals, [modal]: false }
      })),
      closeAllModals: () => set((state) => ({
        modals: Object.keys(state.modals).reduce((acc, key) => {
          acc[key as keyof UIState['modals']] = false
          return acc
        }, {} as UIState['modals'])
      })),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        preferences: state.preferences,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)