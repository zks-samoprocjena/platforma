import { setRequestLocale, getTranslations } from 'next-intl/server';
import DashboardLayout from '@/components/dashboard/dashboard-layout';
import { AdminDocumentsClient } from './admin-documents-client';

interface AdminDocumentsPageProps {
  params: { locale: string }
}

export async function generateMetadata({ params: { locale } }: AdminDocumentsPageProps) {
  const t = await getTranslations({ locale, namespace: 'documents' });
  
  return {
    title: `Admin - ${t('globalDocuments')}`,
    description: 'Manage global compliance standards and documents',
  };
}

export default function AdminDocumentsPage({ params: { locale } }: AdminDocumentsPageProps) {
  setRequestLocale(locale);
  
  return (
    <DashboardLayout>
      <AdminDocumentsClient />
    </DashboardLayout>
  );
}