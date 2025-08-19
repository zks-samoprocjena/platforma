import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExportAssessmentPDF, useArchiveAssessment } from '@/hooks/api/use-assessment-actions';
import { apiClient } from '@/lib/api-client';
import { notify } from '@/utils/notifications';

// Mock dependencies
jest.mock('@/lib/api-client');
jest.mock('@/utils/notifications');
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock window functions
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();
const mockClick = jest.fn();

global.window.URL.createObjectURL = mockCreateObjectURL;
global.window.URL.revokeObjectURL = mockRevokeObjectURL;

// Test component that uses the hook
function TestComponent({ hook, onResult }: { hook: () => any; onResult: (result: any) => void }) {
  const result = hook();
  React.useEffect(() => {
    onResult(result);
  }, [result, onResult]);
  return null;
}

describe('useExportAssessmentPDF', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Reset mocks
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    
    // Mock document methods
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;
    
    // Mock createElement
    const mockLink = {
      href: '',
      download: '',
      click: mockClick,
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
  });

  it('successfully exports PDF', async () => {
    const mockPdfData = new Blob(['PDF content'], { type: 'application/pdf' });
    const mockResponse = {
      data: mockPdfData,
      headers: {
        'content-disposition': 'attachment; filename="assessment-123.pdf"',
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    let mutation: any;
    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent 
          hook={useExportAssessmentPDF} 
          onResult={(result) => { mutation = result; }}
        />
      </QueryClientProvider>
    );

    // Trigger the mutation
    mutation.mutate('assessment-123');

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/assessments/assessment-123/export/pdf',
        {
          responseType: 'blob',
          headers: {
            'Accept': 'application/pdf',
          },
        }
      );

      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockClick).toHaveBeenCalled();
      expect(notify.success).toHaveBeenCalledWith('exportSuccess');
    });

    // Check cleanup
    await waitFor(() => {
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    }, { timeout: 200 });
  });

  it('handles export failure', async () => {
    const error = new Error('Export failed');
    (apiClient.get as jest.Mock).mockRejectedValue(error);

    let mutation: any;
    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent 
          hook={useExportAssessmentPDF} 
          onResult={(result) => { mutation = result; }}
        />
      </QueryClientProvider>
    );

    mutation.mutate('assessment-123');

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('exportError');
    });
  });
});

describe('useArchiveAssessment', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  it('successfully archives assessment', async () => {
    const mockResponse = { success: true };
    (apiClient.delete as jest.Mock).mockResolvedValue({ data: mockResponse });

    let mutation: any;
    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent 
          hook={useArchiveAssessment} 
          onResult={(result) => { mutation = result; }}
        />
      </QueryClientProvider>
    );

    mutation.mutate('assessment-123');

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/assessments/assessment-123');
      expect(notify.success).toHaveBeenCalledWith('archiveSuccess');
    });
  });

  it('handles archive failure', async () => {
    const error = new Error('Archive failed');
    (apiClient.delete as jest.Mock).mockRejectedValue(error);

    let mutation: any;
    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent 
          hook={useArchiveAssessment} 
          onResult={(result) => { mutation = result; }}
        />
      </QueryClientProvider>
    );

    mutation.mutate('assessment-123');

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('archiveError');
    });
  });
});