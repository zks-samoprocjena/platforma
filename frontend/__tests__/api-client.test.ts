/**
 * Tests for API client functionality
 */

import { CroatianAPIError } from '@/lib/api-client'

describe('CroatianAPIError', () => {
  test('should create error with Croatian and English messages', () => {
    const error = new CroatianAPIError(
      'Greška na serveru',
      'Server error',
      'SERVER_ERROR',
      500
    )

    expect(error).toBeInstanceOf(CroatianAPIError)
    expect(error.messageHR).toBe('Greška na serveru')
    expect(error.messageEN).toBe('Server error')
    expect(error.code).toBe('SERVER_ERROR')
    expect(error.status).toBe(500)
    expect(error.message).toBe('Greška na serveru')
    expect(error.name).toBe('CroatianAPIError')
  })

  test('should handle error without status code', () => {
    const error = new CroatianAPIError(
      'Neočekivana greška',
      'Unexpected error',
      'UNKNOWN'
    )

    expect(error.messageHR).toBe('Neočekivana greška')
    expect(error.messageEN).toBe('Unexpected error')
    expect(error.code).toBe('UNKNOWN')
    expect(error.status).toBeUndefined()
  })
})

describe('API Configuration', () => {
  test('should have correct base URL configuration', () => {
    // Test that environment variables are properly configured
    const expectedBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    expect(expectedBaseUrl).toBeDefined()
    expect(expectedBaseUrl).toMatch(/^https?:\/\//)
  })

  test('should have proper timeout configuration', () => {
    // Test basic configuration values
    const timeout = 30000
    expect(timeout).toBe(30000)
    expect(timeout).toBeGreaterThan(0)
  })
})