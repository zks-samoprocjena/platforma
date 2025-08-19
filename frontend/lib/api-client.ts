import { getAccessToken } from './auth'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ApiError {
  message: string
  details?: any
  status?: number
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: any,
  options?: RequestInit & { params?: Record<string, any> }
): Promise<T> {
  // Build URL with query parameters if provided
  let url = `${API_BASE_URL}${endpoint}`
  if (options?.params) {
    const searchParams = new URLSearchParams()
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }
  
  console.log(`[apiRequest] ${method} ${url}`)
  console.log(`[apiRequest] Request data:`, data)
  if (options?.params) {
    console.log(`[apiRequest] Query params:`, options.params)
  }
  
  const token = await getAccessToken()
  
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  }
  
  // Don't set Content-Type for FormData - let browser set it with boundary
  if (!(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  
  if (token) {
    headers.Authorization = `Bearer ${token}`
    console.log(`[apiRequest] Authorization header set with token (length: ${token.length})`)
  } else {
    console.warn(`[apiRequest] No access token available`)
  }

  const config: RequestInit = {
    method,
    headers,
    ...options,
  }

  if (data && (method === 'POST' || method === 'PUT')) {
    if (data instanceof FormData) {
      config.body = data
    } else {
      config.body = JSON.stringify(data)
    }
  }

  console.log(`[apiRequest] Request config:`, {
    method,
    url,
    headers: Object.keys(headers),
    bodyLength: typeof config.body === 'string' ? config.body.length : 0
  })

  try {
    const response = await fetch(url, config)
    
    console.log(`[apiRequest] Response status: ${response.status} ${response.statusText}`)
    console.log(`[apiRequest] Response headers:`, Object.fromEntries(response.headers.entries()))
    
    // Clone response to read body multiple times
    const responseClone = response.clone()
    const responseText = await responseClone.text()
    
    console.log(`[apiRequest] Response body (preview):`, responseText.substring(0, 500))
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      let errorDetails = null
      
      try {
        const errorData = JSON.parse(responseText)
        errorMessage = errorData.message || errorData.detail || errorMessage
        errorDetails = errorData
        
        // Handle 422 validation errors differently - they're expected application states
        if (response.status === 422) {
          console.info(`[apiRequest] Validation failed (422):`, errorData)
          
          // If it's a structured validation response, extract the details
          if (errorData.detail && typeof errorData.detail === 'object') {
            errorMessage = errorData.detail.message || errorMessage
            errorDetails = errorData.detail
          }
        } else {
          // Log other errors as actual errors
          console.error(`[apiRequest] Error response data:`, errorData)
        }
      } catch (parseError) {
        console.error(`[apiRequest] Failed to parse error response:`, parseError)
        errorDetails = { raw: responseText }
      }
      
      const apiError: ApiError = {
        message: errorMessage,
        details: errorDetails,
        status: response.status
      }
      
      throw apiError
    }

    // Parse successful response
    try {
      // Handle empty responses (e.g., 204 No Content)
      if (!responseText || responseText.trim() === '') {
        console.log(`[apiRequest] Empty response (status: ${response.status})`)
        return null as any
      }
      
      const responseData = JSON.parse(responseText)
      console.log(`[apiRequest] Successful response data:`, responseData)
      return responseData
    } catch (parseError) {
      console.error(`[apiRequest] Failed to parse successful response:`, parseError)
      throw new Error(`Failed to parse response: ${parseError}`)
    }
    
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`[apiRequest] Network error:`, error)
      throw new Error('Network error. Please check your connection.')
    }
    
    console.error(`[apiRequest] Request failed:`, error)
    throw error
  }
}

// Utility function for streaming requests
export async function streamingRequest(
  endpoint: string,
  data: any,
  onChunk: (chunk: string) => void,
  onComplete: (fullResponse: string, metadata?: any) => void,
  onError: (error: string) => void
): Promise<void> {
  const url = `${API_BASE_URL}${endpoint}`
  
  console.log(`[streamingRequest] POST ${url}`)
  console.log(`[streamingRequest] Request data:`, data)
  
  const token = await getAccessToken()
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }
  
  if (token) {
    headers.Authorization = `Bearer ${token}`
    console.log(`[streamingRequest] Authorization header set`)
  } else {
    console.warn(`[streamingRequest] No access token available`)
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })
    
    console.log(`[streamingRequest] Response status: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[streamingRequest] Error response:`, errorText)
      onError(`HTTP ${response.status}: ${response.statusText}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      console.error(`[streamingRequest] No response body reader available`)
      onError('No response body available')
      return
    }

    let fullResponse = ''
    let chunkCount = 0
    
    console.log(`[streamingRequest] Starting to read stream`)
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        console.log(`[streamingRequest] Stream ended. Total chunks: ${chunkCount}`)
        console.log(`[streamingRequest] Full response length: ${fullResponse.length}`)
        break
      }
      
      const chunk = new TextDecoder().decode(value)
      chunkCount++
      
      console.log(`[streamingRequest] Chunk ${chunkCount}:`, chunk.substring(0, 100))
      
      // Process Server-Sent Events
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            console.log(`[streamingRequest] Received DONE signal`)
            onComplete(fullResponse)
            return
          }
          
          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              fullResponse += parsed.content
              onChunk(parsed.content)
            }
            if (parsed.metadata) {
              console.log(`[streamingRequest] Received metadata:`, parsed.metadata)
            }
          } catch (e) {
            console.warn(`[streamingRequest] Failed to parse chunk:`, data)
          }
        }
      }
    }
    
    onComplete(fullResponse)
    
  } catch (error) {
    console.error(`[streamingRequest] Streaming request failed:`, error)
    onError(`Streaming request failed: ${error}`)
  }
}

// API client object with convenient methods
export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) => apiRequest<T>('GET', endpoint, undefined, options),
  post: <T>(endpoint: string, data?: any, options?: RequestInit) => apiRequest<T>('POST', endpoint, data, options),
  put: <T>(endpoint: string, data?: any, options?: RequestInit) => apiRequest<T>('PUT', endpoint, data, options),
  delete: <T>(endpoint: string, options?: RequestInit) => apiRequest<T>('DELETE', endpoint, undefined, options),
}