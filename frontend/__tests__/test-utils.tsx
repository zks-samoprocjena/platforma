import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { Assessment, SecurityLevel, AssessmentStatus } from '@/types/assessment';

// Create a custom render function that includes all providers
export function renderWithProviders(
  ui: React.ReactElement,
  {
    locale = 'hr',
    messages = {},
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    ...renderOptions
  }: {
    locale?: string;
    messages?: any;
    queryClient?: QueryClient;
  } & Omit<RenderOptions, 'wrapper'> = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Mock data factories
export function createMockAssessment(overrides?: Partial<Assessment>): Assessment {
  return {
    id: 'test-assessment-123',
    organization_id: 'org-123',
    title: 'Test Assessment',
    description: 'Test description',
    security_level: 'srednja' as SecurityLevel,
    status: 'in_progress' as AssessmentStatus,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'user-123',
    updated_by: 'user-123',
    progress: {
      total_controls: 100,
      completed_controls: 75,
      mandatory_controls: 40,
      completed_mandatory: 34,
      completion_percentage: 75,
      sections_completed: 8,
      total_sections: 10,
      last_activity: new Date().toISOString(),
    },
    ...overrides,
  };
}

export function createMockAssessments(count: number = 5): Assessment[] {
  return Array.from({ length: count }, (_, i) => 
    createMockAssessment({
      id: `assessment-${i}`,
      title: `Assessment ${i + 1}`,
      status: i === 0 ? 'completed' : i === 1 ? 'in_progress' : 'draft',
      progress: i === 0 ? {
        total_controls: 100,
        completed_controls: 100,
        mandatory_controls: 40,
        completed_mandatory: 40,
        completion_percentage: 100,
        sections_completed: 10,
        total_sections: 10,
        last_activity: new Date().toISOString(),
      } : undefined,
    })
  );
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';