import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiClient } from '@/lib/api-client';
import { notify } from '@/utils/notifications';

export function useExportAssessmentPDF() {
  const t = useTranslations('Assessment');
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (assessmentId: string) => {
      const response = await apiClient.get(
        `/api/v1/assessments/v3/${assessmentId}/export/pdf`,
        { 
          responseType: 'blob',
          headers: {
            'Accept': 'application/pdf'
          }
        }
      );
      
      // Create blob and trigger download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `assessment-${assessmentId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
      
      return { success: true };
    },
    onSuccess: () => {
      notify.success(t('exportSuccess', { defaultValue: 'PDF exported successfully' }));
    },
    onError: (error: any) => {
      console.error('PDF export error:', error);
      notify.error(
        t('exportError', { 
          defaultValue: 'Failed to export PDF' 
        })
      );
    }
  });
}

export function useArchiveAssessment() {
  const t = useTranslations('Assessment');
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (assessmentId: string) => {
      const response = await apiClient.delete(`/api/v1/assessments/${assessmentId}`);
      return response.data;
    },
    onSuccess: (data, assessmentId) => {
      // Invalidate assessments list to refresh
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      
      notify.success(t('archiveSuccess', { defaultValue: 'Assessment archived successfully' }));
    },
    onError: (error: any) => {
      console.error('Archive error:', error);
      notify.error(
        t('archiveError', { 
          defaultValue: 'Failed to archive assessment' 
        })
      );
    }
  });
}