'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth, useUser } from '@/hooks/useAuth';

interface AdminAccessWrapperProps {
  children: React.ReactNode;
  locale: string;
}

export function AdminAccessWrapper({ children, locale }: AdminAccessWrapperProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const user = useUser();
  const router = useRouter();
  const t = useTranslations('admin');
  const [hasAccess, setHasAccess] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      console.log('[AdminAccessWrapper] Checking admin access...', {
        isLoading,
        isAuthenticated,
        user: user ? {
          id: user.id,
          email: user.email,
          roles: user.roles,
          name: user.name
        } : null
      });

      if (isLoading) {
        console.log('[AdminAccessWrapper] Still loading, waiting...');
        return;
      }
      
      if (!isAuthenticated || !user) {
        console.log('[AdminAccessWrapper] Not authenticated or no user, redirecting to login');
        router.push(`/${locale}/auth/signin?redirect=${encodeURIComponent(`/${locale}/admin`)}`);
        return;
      }

      // Check if user has admin role
      const userRoles = user.roles || [];
      const isAdmin = userRoles.includes('admin');
      
      console.log('[AdminAccessWrapper] Role check:', {
        userRoles,
        isAdmin,
        hasAdminRole: userRoles.includes('admin')
      });
      
      if (!isAdmin) {
        console.log('[AdminAccessWrapper] User is not admin, redirecting to dashboard');
        router.push(`/${locale}/dashboard?error=access_denied`);
        return;
      }

      console.log('[AdminAccessWrapper] Admin access granted!');
      setHasAccess(true);
      setChecking(false);
    };

    checkAdminAccess();
  }, [user, isAuthenticated, isLoading, router, locale]);

  if (isLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('checkingAccess')}</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{t('accessDenied')}</h1>
          <p className="mt-2 text-gray-600">{t('adminAccessRequired')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
} 