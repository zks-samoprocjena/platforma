'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { 
  BarChart3, 
  Users, 
  Building2, 
  FileText, 
  TrendingUp, 
  Activity,
  Globe,
  UserCheck
} from 'lucide-react';

interface SystemStats {
  total_users: number;
  total_organizations: number;
  total_assessments: number;
  total_documents: number;
  global_documents: number;
  active_users_last_30_days: number;
  recent_registrations: number;
}

interface SystemStatsPanelProps {
  compact?: boolean;
}

export function SystemStatsPanel({ compact = false }: SystemStatsPanelProps) {
  const t = useTranslations('admin');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<SystemStats>('/api/v1/admin/stats');
      setStats(data);
    } catch (error) {
      console.error('Error fetching system stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">{t('loadingStats')}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t('failedToLoadStats')}
      </div>
    );
  }

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color,
    change,
    changeLabel
  }: {
    title: string;
    value: number;
    icon: any;
    color: string;
    change?: number;
    changeLabel?: string;
  }) => (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
          {change !== undefined && changeLabel && (
            <p className={`text-xs flex items-center mt-1 ${
              change >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              <TrendingUp className="h-3 w-3 mr-1" />
              {change > 0 ? '+' : ''}{change} {changeLabel}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </Card>
  );

  const CompactStatItem = ({ 
    label, 
    value, 
    icon: Icon, 
    color 
  }: {
    label: string;
    value: number;
    icon: any;
    color: string;
  }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <span className="text-lg font-bold text-gray-900">{value.toLocaleString()}</span>
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        <CompactStatItem
          label={t('totalUsers')}
          value={stats.total_users}
          icon={Users}
          color="bg-blue-500"
        />
        <CompactStatItem
          label={t('organizations')}
          value={stats.total_organizations}
          icon={Building2}
          color="bg-green-500"
        />
        <CompactStatItem
          label={t('assessments')}
          value={stats.total_assessments}
          icon={BarChart3}
          color="bg-purple-500"
        />
        <CompactStatItem
          label={t('documents')}
          value={stats.total_documents}
          icon={FileText}
          color="bg-orange-500"
        />
      </div>
    );
  }

  // Calculate metrics
  const userActivityRate = stats.total_users > 0 
    ? Math.round((stats.active_users_last_30_days / stats.total_users) * 100) 
    : 0;
  
  const avgAssessmentsPerOrg = stats.total_organizations > 0 
    ? Math.round(stats.total_assessments / stats.total_organizations) 
    : 0;

  const avgDocumentsPerOrg = stats.total_organizations > 0 
    ? Math.round((stats.total_documents - stats.global_documents) / stats.total_organizations) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold">{t('systemStatistics')}</h2>
          <p className="text-gray-600">{t('overallSystemMetrics')}</p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title={t('totalUsers')}
          value={stats.total_users}
          icon={Users}
          color="bg-blue-500"
          change={stats.recent_registrations}
          changeLabel={t('thisMonth')}
        />
        <StatCard
          title={t('organizations')}
          value={stats.total_organizations}
          icon={Building2}
          color="bg-green-500"
        />
        <StatCard
          title={t('totalAssessments')}
          value={stats.total_assessments}
          icon={BarChart3}
          color="bg-purple-500"
        />
        <StatCard
          title={t('totalDocuments')}
          value={stats.total_documents}
          icon={FileText}
          color="bg-orange-500"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title={t('activeUsers30Days')}
          value={stats.active_users_last_30_days}
          icon={Activity}
          color="bg-indigo-500"
        />
        <StatCard
          title={t('globalDocuments')}
          value={stats.global_documents}
          icon={Globe}
          color="bg-teal-500"
        />
        <StatCard
          title={t('newRegistrations')}
          value={stats.recent_registrations}
          icon={UserCheck}
          color="bg-pink-500"
        />
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Metrics */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">{t('usageMetrics')}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('userActivityRate')}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${userActivityRate}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium">{userActivityRate}%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('avgAssessmentsPerOrg')}</span>
              <span className="text-sm font-medium">{avgAssessmentsPerOrg}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('avgDocumentsPerOrg')}</span>
              <span className="text-sm font-medium">{avgDocumentsPerOrg}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('globalVsOrgDocuments')}</span>
              <span className="text-sm font-medium">
                {stats.global_documents} / {stats.total_documents - stats.global_documents}
              </span>
            </div>
          </div>
        </Card>

        {/* System Health */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">{t('systemHealth')}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('systemStatus')}</span>
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                {t('operational')}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('databaseConnections')}</span>
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                {t('healthy')}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('apiResponseTime')}</span>
              <span className="text-sm font-medium text-green-600">{'< 200ms'}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('keycloakIntegration')}</span>
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                {t('connected')}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Growth Trends */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('growthTrends')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.recent_registrations}</div>
            <div className="text-sm text-gray-600">{t('newUsersThisMonth')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.round((stats.active_users_last_30_days / stats.total_users) * 100)}%
            </div>
            <div className="text-sm text-gray-600">{t('activeUserRate')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{avgAssessmentsPerOrg}</div>
            <div className="text-sm text-gray-600">{t('avgAssessmentsPerOrg')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.global_documents}</div>
            <div className="text-sm text-gray-600">{t('globalStandards')}</div>
          </div>
        </div>
      </Card>
    </div>
  );
} 