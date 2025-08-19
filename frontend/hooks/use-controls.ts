import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface Control {
  id: string;
  measure_id: string;
  submeasure_id: string;
  title: string;
  description: string;
  security_level: 'osnovna' | 'srednja' | 'napredna';
  is_mandatory: boolean;
}

interface ControlsResponse {
  controls: Control[];
  total: number;
}

export function useControls() {
  return useQuery({
    queryKey: ['controls'],
    queryFn: async () => {
      const response = await apiRequest<ControlsResponse>('GET', '/api/v1/controls/', null, {
        params: {
          limit: 1000 // Get all controls for KPI calculations
        }
      });
      return response.controls || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}