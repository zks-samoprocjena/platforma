'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { 
  Building2, 
  Users, 
  BarChart3, 
  FileText, 
  Calendar,
  TrendingUp,
  Search,
  Eye,
  Activity
} from 'lucide-react';

interface OrganizationStats {
  id: string;
  name: string;
  user_count: number;
  assessment_count: number;
  document_count: number;
  created_at?: string;
}

export function OrganizationManagementPanel() {
  const t = useTranslations('admin');
  const [organizations, setOrganizations] = useState<OrganizationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'users' | 'assessments' | 'documents'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<OrganizationStats[]>('/api/v1/admin/organizations');
      setOrganizations(data);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Filter and sort organizations
  const filteredAndSortedOrganizations = organizations
    .filter(org => 
      org.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'users':
          aValue = a.user_count;
          bValue = b.user_count;
          break;
        case 'assessments':
          aValue = a.assessment_count;
          bValue = b.assessment_count;
          break;
        case 'documents':
          aValue = a.document_count;
          bValue = b.document_count;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  const handleSort = (field: 'name' | 'users' | 'assessments' | 'documents') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('unknown');
    return new Date(dateString).toLocaleDateString();
  };

  // Calculate summary statistics
  const totalUsers = organizations.reduce((sum, org) => sum + org.user_count, 0);
  const totalAssessments = organizations.reduce((sum, org) => sum + org.assessment_count, 0);
  const totalDocuments = organizations.reduce((sum, org) => sum + org.document_count, 0);
  const avgUsersPerOrg = organizations.length > 0 ? Math.round(totalUsers / organizations.length) : 0;

  const SortButton = ({ field, children }: { field: 'name' | 'users' | 'assessments' | 'documents', children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
    >
      {children}
      {sortBy === field && (
        <span className="text-blue-600">
          {sortOrder === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold">{t('organizationManagement')}</h2>
            <p className="text-gray-600">{t('manageOrganizations')}</p>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {t('totalOrganizations', { count: organizations.length })}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalUsers')}</p>
              <p className="text-2xl font-bold text-gray-900">{totalUsers.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalAssessments')}</p>
              <p className="text-2xl font-bold text-gray-900">{totalAssessments.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-full bg-purple-500">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalDocuments')}</p>
              <p className="text-2xl font-bold text-gray-900">{totalDocuments.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-full bg-orange-500">
              <FileText className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('avgUsersPerOrg')}</p>
              <p className="text-2xl font-bold text-gray-900">{avgUsersPerOrg}</p>
            </div>
            <div className="p-3 rounded-full bg-green-500">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('searchOrganizations')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <button
            onClick={() => setSearch('')}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('clearSearch')}
          </button>
        </div>
      </Card>

      {/* Organizations Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">{t('loadingOrganizations')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <SortButton field="name">{t('organization')}</SortButton>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <SortButton field="users">{t('users')}</SortButton>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <SortButton field="assessments">{t('assessments')}</SortButton>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <SortButton field="documents">{t('documents')}</SortButton>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('activity')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('created')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedOrganizations.map((org) => {
                  const activityLevel = org.assessment_count > 5 ? 'high' : 
                                       org.assessment_count > 1 ? 'medium' : 'low';
                  
                  return (
                    <tr key={org.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{org.name}</div>
                            <div className="text-sm text-gray-500">ID: {org.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">{org.user_count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <BarChart3 className="h-4 w-4 mr-2 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">{org.assessment_count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="h-4 w-4 mr-2 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">{org.document_count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          activityLevel === 'high' ? 'bg-green-100 text-green-800' :
                          activityLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {activityLevel === 'high' ? t('highActivity') :
                           activityLevel === 'medium' ? t('mediumActivity') :
                           t('lowActivity')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(org.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-blue-600 hover:text-blue-900 mr-3">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="text-green-600 hover:text-green-900">
                          <Activity className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Organization Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performing Organizations */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">{t('topPerformingOrganizations')}</h3>
          <div className="space-y-3">
            {organizations
              .sort((a, b) => b.assessment_count - a.assessment_count)
              .slice(0, 5)
              .map((org, index) => (
                <div key={org.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 text-sm font-semibold rounded-full">
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-900">{org.name}</span>
                  </div>
                  <span className="text-sm text-gray-600">{org.assessment_count} {t('assessments')}</span>
                </div>
              ))}
          </div>
        </Card>

        {/* Organization Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">{t('organizationDistribution')}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('smallOrganizations')} (1-5 users)</span>
              <span className="text-sm font-medium">
                {organizations.filter(org => org.user_count <= 5).length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('mediumOrganizations')} (6-20 users)</span>
              <span className="text-sm font-medium">
                {organizations.filter(org => org.user_count > 5 && org.user_count <= 20).length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t('largeOrganizations')} (20+ users)</span>
              <span className="text-sm font-medium">
                {organizations.filter(org => org.user_count > 20).length}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium text-gray-900">{t('totalOrganizations')}</span>
              <span className="text-sm font-bold text-gray-900">{organizations.length}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
} 