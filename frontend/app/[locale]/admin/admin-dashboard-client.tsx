'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Building2, BarChart3, FileText, Shield } from 'lucide-react';

// Import admin panel components
import { UserManagementPanel } from './components/user-management-panel';
import { OrganizationManagementPanel } from './components/organization-management-panel';
import { SystemStatsPanel } from './components/system-stats-panel';
import { DocumentManagementPanel } from './components/document-management-panel';

export function AdminDashboardClient() {
  const t = useTranslations('admin');
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('adminDashboard')}</h1>
          <p className="text-gray-600">{t('adminDashboardDescription')}</p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('overview')}
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('userManagement')}
          </TabsTrigger>
          <TabsTrigger value="organizations" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t('organizations')}
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('globalDocuments')}
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('systemStats')}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Stats */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('quickStats')}</h3>
              <SystemStatsPanel compact={true} />
            </Card>

            {/* Recent Activity */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('recentActivity')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="text-sm">{t('newUserRegistrations')}</span>
                  <span className="font-semibold text-green-600">+5</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="text-sm">{t('activeAssessments')}</span>
                  <span className="font-semibold text-blue-600">12</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="text-sm">{t('documentsProcessed')}</span>
                  <span className="font-semibold text-purple-600">8</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{t('quickActions')}</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTab('users')}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                {t('manageUsers')}
              </button>
              <button
                onClick={() => setActiveTab('organizations')}
                className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
              >
                {t('viewOrganizations')}
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              >
                {t('uploadGlobalDocument')}
              </button>
            </div>
          </Card>
        </TabsContent>

        {/* User Management Tab */}
        <TabsContent value="users">
          <UserManagementPanel />
        </TabsContent>

        {/* Organization Management Tab */}
        <TabsContent value="organizations">
          <OrganizationManagementPanel />
        </TabsContent>

        {/* Document Management Tab */}
        <TabsContent value="documents">
          <DocumentManagementPanel />
        </TabsContent>

        {/* System Statistics Tab */}
        <TabsContent value="system">
          <SystemStatsPanel compact={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
} 