import { ProtectedRoute } from '@/components/protected-route'

interface DashboardLayoutProps {
  children: React.ReactNode
  params: { locale: string }
}

export default function DashboardLayout({ 
  children, 
  params: { locale } 
}: DashboardLayoutProps) {
  return (
    <ProtectedRoute locale={locale}>
      {children}
    </ProtectedRoute>
  )
}