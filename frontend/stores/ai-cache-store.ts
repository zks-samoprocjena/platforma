import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AIResponse {
  content: string
  sources?: any[]
  metadata?: any
  timestamp: number
}

export interface AIConversation {
  question: string
  answer: string
  timestamp: number
}

export interface AIControlCache {
  guidance?: AIResponse
  conversations: AIConversation[]
  lastAccessed: number
}

interface AICacheState {
  // Cache structure: {assessmentId}-{controlId} -> AIControlCache
  responseCache: Record<string, AIControlCache>
  
  // Get cached guidance for a control
  getCachedGuidance: (assessmentId: string, controlId: string) => AIResponse | null
  
  // Set cached guidance for a control
  setCachedGuidance: (assessmentId: string, controlId: string, response: AIResponse) => void
  
  // Update last accessed time for a control (separate from read to avoid re-renders)
  updateLastAccessed: (assessmentId: string, controlId: string) => void
  
  // Add a conversation to control's history
  addConversation: (assessmentId: string, controlId: string, conversation: AIConversation) => void
  
  // Get conversation history for a control
  getConversations: (assessmentId: string, controlId: string) => AIConversation[]
  
  // Clear cache for specific control
  clearControlCache: (assessmentId: string, controlId: string) => void
  
  // Clear cache for entire assessment
  clearAssessmentCache: (assessmentId: string) => void
  
  // Clear all cache
  clearAllCache: () => void
  
  // Check if cache is stale (older than 2 hours)
  isCacheStale: (timestamp: number) => boolean
}

// 2 hours in milliseconds
const CACHE_DURATION = 2 * 60 * 60 * 1000

export const useAICacheStore = create<AICacheState>()(
  persist(
    (set, get) => ({
      responseCache: {},
      
      getCachedGuidance: (assessmentId: string, controlId: string) => {
        const cacheKey = `${assessmentId}-${controlId}`
        const cache = get().responseCache[cacheKey]
        
        if (!cache?.guidance) return null
        
        // Check if cache is stale
        if (get().isCacheStale(cache.guidance.timestamp)) {
          return null
        }
        
        // Don't update state here to avoid re-render loops
        // Just return the cached guidance
        return cache.guidance
      },
      
      setCachedGuidance: (assessmentId: string, controlId: string, response: AIResponse) => {
        const cacheKey = `${assessmentId}-${controlId}`
        const existingCache = get().responseCache[cacheKey] || { conversations: [], lastAccessed: Date.now() }
        
        set((state) => ({
          responseCache: {
            ...state.responseCache,
            [cacheKey]: {
              ...existingCache,
              guidance: response,
              lastAccessed: Date.now()
            }
          }
        }))
      },
      
      updateLastAccessed: (assessmentId: string, controlId: string) => {
        const cacheKey = `${assessmentId}-${controlId}`
        const cache = get().responseCache[cacheKey]
        
        if (cache) {
          set((state) => ({
            responseCache: {
              ...state.responseCache,
              [cacheKey]: {
                ...cache,
                lastAccessed: Date.now()
              }
            }
          }))
        }
      },
      
      addConversation: (assessmentId: string, controlId: string, conversation: AIConversation) => {
        const cacheKey = `${assessmentId}-${controlId}`
        const existingCache = get().responseCache[cacheKey] || { conversations: [], lastAccessed: Date.now() }
        
        // Keep only last 10 conversations per control
        const updatedConversations = [...existingCache.conversations, conversation].slice(-10)
        
        set((state) => ({
          responseCache: {
            ...state.responseCache,
            [cacheKey]: {
              ...existingCache,
              conversations: updatedConversations,
              lastAccessed: Date.now()
            }
          }
        }))
      },
      
      getConversations: (assessmentId: string, controlId: string) => {
        const cacheKey = `${assessmentId}-${controlId}`
        const cache = get().responseCache[cacheKey]
        return cache?.conversations || []
      },
      
      clearControlCache: (assessmentId: string, controlId: string) => {
        const cacheKey = `${assessmentId}-${controlId}`
        set((state) => {
          const newCache = { ...state.responseCache }
          delete newCache[cacheKey]
          return { responseCache: newCache }
        })
      },
      
      clearAssessmentCache: (assessmentId: string) => {
        set((state) => {
          const newCache = { ...state.responseCache }
          // Remove all entries for this assessment
          Object.keys(newCache).forEach(key => {
            if (key.startsWith(`${assessmentId}-`)) {
              delete newCache[key]
            }
          })
          return { responseCache: newCache }
        })
      },
      
      clearAllCache: () => {
        set({ responseCache: {} })
      },
      
      isCacheStale: (timestamp: number) => {
        return Date.now() - timestamp > CACHE_DURATION
      }
    }),
    {
      name: 'ai-cache-storage',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name)
        }
      }
    }
  )
)

// Helper hook to clear cache on logout
export const useAICacheCleaner = () => {
  const clearAllCache = useAICacheStore(state => state.clearAllCache)
  
  return {
    clearOnLogout: () => {
      clearAllCache()
      sessionStorage.removeItem('ai-cache-storage')
    }
  }
}