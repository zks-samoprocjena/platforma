import { setRequestLocale, getTranslations } from 'next-intl/server';
import DashboardLayout from '@/components/dashboard/dashboard-layout';
import { AdminDashboardClient } from './admin-dashboard-client';
import { AdminAccessWrapper } from './admin-access-wrapper';

interface AdminPageProps {
  params: { locale: string }
}

export async function generateMetadata({ params: { locale } }: AdminPageProps) {
  const t = await getTranslations({ locale, namespace: 'admin' });
  
  return {
    title: `${t('adminDashboard')} - System Administration`,
    description: 'System administration dashboard for user and organization management',
  };
}

export default function AdminPage({ params: { locale } }: AdminPageProps) {
  setRequestLocale(locale);
  
  return (
    <AdminAccessWrapper locale={locale}>
      <DashboardLayout>
        <AdminDashboardClient />
      </DashboardLayout>
    </AdminAccessWrapper>
  );
} 