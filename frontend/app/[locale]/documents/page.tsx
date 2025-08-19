import { setRequestLocale, getTranslations } from 'next-intl/server';
import DashboardLayout from '@/components/dashboard/dashboard-layout';
import { DocumentsClient } from './documents-client';

interface DocumentsPageProps {
  params: { locale: string }
}

export async function generateMetadata({ params: { locale } }: DocumentsPageProps) {
  const t = await getTranslations({ locale, namespace: 'documents' });
  
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default function DocumentsPage({ params: { locale } }: DocumentsPageProps) {
  setRequestLocale(locale);
  
  return (
    <DashboardLayout>
      <DocumentsClient />
    </DashboardLayout>
  );
}