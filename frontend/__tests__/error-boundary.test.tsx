/**
 * Tests for error boundary components
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { ErrorBoundary, APIErrorBoundary } from '@/components/error-boundary'

const messages = {
  errors: {
    title: 'Došlo je do greške',
    description: 'Dogodila se neočekivana greška. Molimo pokušajte ponovno.',
    technicalDetails: 'Tehnički detalji',
    tryAgain: 'Pokušaj ponovno',
    reloadPage: 'Osvježi stranicu',
    api: {
      title: 'Greška u komunikaciji',
      description: 'Neuspješno dohvaćanje podataka s poslužitelja.',
      retry: 'Pokušaj ponovno'
    }
  }
}

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="hr" messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}

describe('ErrorBoundary', () => {
  test('should render children when no error occurs', () => {
    render(
      <TestWrapper>
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      </TestWrapper>
    )

    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  test('should render error fallback when error occurs', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestWrapper>
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      </TestWrapper>
    )

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('description')).toBeInTheDocument()
    expect(screen.getByText('tryAgain')).toBeInTheDocument()
    expect(screen.getByText('reloadPage')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  test('should show technical details when expanded', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestWrapper>
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      </TestWrapper>
    )

    const detailsToggle = screen.getByText('technicalDetails')
    fireEvent.click(detailsToggle)

    expect(screen.getByText('Test error')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  test('should have try again button when error occurs', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestWrapper>
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      </TestWrapper>
    )

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('tryAgain')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})

describe('APIErrorBoundary', () => {
  test('should render API-specific error message', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <TestWrapper>
        <APIErrorBoundary>
          <ThrowError shouldThrow={true} />
        </APIErrorBoundary>
      </TestWrapper>
    )

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('description')).toBeInTheDocument()
    expect(screen.getByText('retry')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})