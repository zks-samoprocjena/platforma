import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
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

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('successfully exports PDF', async () => {
    const mockPdfData = new Blob(['PDF content'], { type: 'application/pdf' });
    const mockResponse = {
      data: mockPdfData,
      headers: {
        'content-disposition': 'attachment; filename="assessment-123.pdf"',
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useExportAssessmentPDF(), { wrapper });

    result.current.mutate('assessment-123');

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

    const { result } = renderHook(() => useExportAssessmentPDF(), { wrapper });

    result.current.mutate('assessment-123');

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('exportError');
    });
  });

  it('uses default filename when content-disposition is missing', async () => {
    const mockPdfData = new Blob(['PDF content'], { type: 'application/pdf' });
    const mockResponse = {
      data: mockPdfData,
      headers: {},
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useExportAssessmentPDF(), { wrapper });
    
    const mockLink = {
      href: '',
      download: '',
      click: mockClick,
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

    result.current.mutate('assessment-123');

    await waitFor(() => {
      expect(mockLink.download).toBe('assessment-assessment-123.pdf');
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

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('successfully archives assessment', async () => {
    const mockResponse = { success: true };
    (apiClient.delete as jest.Mock).mockResolvedValue({ data: mockResponse });

    const { result } = renderHook(() => useArchiveAssessment(), { wrapper });

    result.current.mutate('assessment-123');

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/assessments/assessment-123');
      expect(notify.success).toHaveBeenCalledWith('archiveSuccess');
      expect(queryClient.getQueryState(['assessments'])).toBeDefined();
    });
  });

  it('handles archive failure', async () => {
    const error = new Error('Archive failed');
    (apiClient.delete as jest.Mock).mockRejectedValue(error);

    const { result } = renderHook(() => useArchiveAssessment(), { wrapper });

    result.current.mutate('assessment-123');

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('archiveError');
    });
  });
});