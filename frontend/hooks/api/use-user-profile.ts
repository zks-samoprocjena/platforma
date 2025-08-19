/**
 * Hook for user profile management
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

export interface UserProfile {
  user_id: string;
  email?: string;
  name?: string;
  roles: string[];
  organization_id: string;
  organization_name?: string;
  
  // Profile attributes (editable)
  job_title?: string;
  department?: string;
  phone?: string;
  location?: string;
  responsibilities?: string;
}

export interface UpdateUserProfileRequest {
  job_title?: string;
  department?: string;
  phone?: string;
  location?: string;
  responsibilities?: string;
}

export interface UserRoles {
  jwt_roles: string[];
  keycloak_roles: string[];
  roles_match: boolean;
}

/**
 * Hook to get user profile data
 */
export function useUserProfile() {
  return useQuery({
    queryKey: ['user-profile'],
    queryFn: async (): Promise<UserProfile> => {
      const data = await apiClient.get('/api/v1/users/profile');
      return data;
    },
    retry: 1,
  });
}

/**
 * Hook to get user roles information
 */
export function useUserRoles() {
  return useQuery({
    queryKey: ['user-roles'],
    queryFn: async (): Promise<UserRoles> => {
      const data = await apiClient.get('/api/v1/users/roles');
      return data;
    },
    retry: 1,
  });
}

/**
 * Hook to update user profile
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const t = useTranslations('Settings');

  return useMutation({
    mutationFn: async (profileData: UpdateUserProfileRequest): Promise<UserProfile> => {
      const data = await apiClient.put('/api/v1/users/profile', profileData);
      return data;
    },
    onSuccess: (data) => {
      // Update user profile cache
      queryClient.setQueryData(['user-profile'], data);
      
      // Show success message
      toast.success(t('profile.updateSuccess') || 'Profile updated successfully');
    },
    onError: (error: any) => {
      // Show error message
      const errorMessage = error.response?.data?.detail || t('profile.updateError') || 'Failed to update profile';
      toast.error(errorMessage);
    },
  });
}

/**
 * Combined hook for user profile management
 */
export function useUserProfileManagement() {
  const profileQuery = useUserProfile();
  const rolesQuery = useUserRoles();
  const updateMutation = useUpdateUserProfile();

  return {
    // Profile data
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    
    // Roles data  
    roles: rolesQuery.data,
    isRolesLoading: rolesQuery.isLoading,
    rolesError: rolesQuery.error,
    
    // Update functionality
    updateProfile: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    
    // Utility functions
    refetch: () => {
      profileQuery.refetch();
      rolesQuery.refetch();
    },
    
    // Computed values
    hasUnsavedChanges: updateMutation.isPending,
    systemRoles: rolesQuery.data?.keycloak_roles || [],
    rolesSynced: rolesQuery.data?.roles_match ?? true,
  };
} 