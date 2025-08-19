'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { 
  Users, 
  Search, 
  Filter, 
  UserCheck, 
  UserX, 
  Mail, 
  Building2, 
  Shield, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2
} from 'lucide-react';

interface UserInfo {
  id: string;
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  organization_id?: string;
  organization_name?: string;
  roles: string[];
  enabled: boolean;
  created_timestamp?: number;
}

interface UserListResponse {
  users: UserInfo[];
  total: number;
  page: number;
  page_size: number;
}

export function UserManagementPanel() {
  const t = useTranslations('admin');
  const { toast } = useToast();
  
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);

  // Function to get role label with fallback
  const getRoleLabel = (roleValue: string): string => {
    try {
      // Try to get translation from the nested roles object
      switch(roleValue) {
        case 'assessment_viewer':
          return t('roles.assessmentViewer') || 'Assessment Viewer';
        case 'assessment_editor': 
          return t('roles.assessmentEditor') || 'Assessment Editor';
        case 'organization_admin':
          return t('roles.organizationAdmin') || 'Organization Admin';
        case 'system_admin':
          return t('roles.systemAdmin') || 'System Admin';
        default:
          return roleValue;
      }
    } catch (error) {
      // Fallback to hardcoded values if translation fails
      const roleLabels: Record<string, string> = {
        'assessment_viewer': 'Assessment Viewer',
        'assessment_editor': 'Assessment Editor', 
        'organization_admin': 'Organization Admin',
        'system_admin': 'System Admin'
      };
      return roleLabels[roleValue] || roleValue;
    }
  };

  const roleOptions = [
    { value: 'assessment_viewer', label: getRoleLabel('assessment_viewer') },
    { value: 'assessment_editor', label: getRoleLabel('assessment_editor') },
    { value: 'organization_admin', label: getRoleLabel('organization_admin') },
    { value: 'system_admin', label: getRoleLabel('system_admin') },
  ];

  // Fetch users data
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });
      
      if (search.trim()) params.set('search', search.trim());
      if (selectedRole) params.set('role', selectedRole);
      if (selectedOrganization) params.set('organization_id', selectedOrganization);

      const data = await apiClient.get<UserListResponse>(`/api/v1/admin/users?${params}`);
      setUsers(data.users);
      setTotal(data.total);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Assign role to user
  const assignRole = async (userId: string, roleName: string) => {
    try {
      await apiClient.post(`/admin/users/${userId}/roles/${roleName}`);

      toast({
        title: t('success'),
        description: t('roleAssignedSuccessfully', { role: roleName }),
      });
      
      fetchUsers(); // Refresh the user list
    } catch (error) {
      console.error('Error assigning role:', error);
      toast({
        title: t('error'),
        description: t('failedToAssignRole'),
        variant: 'destructive',
      });
    }
  };

  // Remove role from user
  const removeRole = async (userId: string, roleName: string) => {
    try {
      await apiClient.delete(`/api/v1/admin/users/${userId}/roles/${roleName}`);

      toast({
        title: 'Success',
        description: `Role ${roleName} removed successfully`,
      });
      
      fetchUsers(); // Refresh the user list
    } catch (error) {
      console.error('Error removing role:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove role',
        variant: 'destructive',
      });
    }
  };

  // Format date
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return t('unknown');
    return new Date(timestamp).toLocaleDateString();
  };

  // Role badge component
  const RoleBadge = ({ role }: { role: string }) => {
    const getRoleColor = (role: string) => {
      switch (role) {
        case 'system_admin': return 'bg-red-100 text-red-800';
        case 'organization_admin': return 'bg-blue-100 text-blue-800';
        case 'assessment_editor': return 'bg-green-100 text-green-800';
        case 'assessment_viewer': return 'bg-gray-100 text-gray-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(role)}`}>
        {getRoleLabel(role)}
      </span>
    );
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search, selectedRole, selectedOrganization]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold">{t('userManagement')}</h2>
            <p className="text-gray-600">{t('manageSystemUsers')}</p>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {t('totalUsers', { count: total })}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('searchUsers')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Role Filter */}
          <div className="min-w-[150px]">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('allRoles')}</option>
              {roleOptions.map(role => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setSearch('');
              setSelectedRole('');
              setSelectedOrganization('');
              setPage(1);
            }}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('clearFilters')}
          </button>
        </div>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">{t('loadingUsers')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('user')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('organization')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('rolesColumn')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('joined')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">
                              {(user.first_name?.[0] || user.email[0]).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name || user.last_name ? 
                              `${user.first_name || ''} ${user.last_name || ''}`.trim() : 
                              user.username
                            }
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Building2 className="h-4 w-4 mr-2 text-gray-400" />
                        {user.organization_name || t('noOrganization')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map(role => (
                            <RoleBadge key={role} role={role} />
                          ))
                        ) : (
                          <span className="text-sm text-gray-500">{t('noRoles')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.enabled 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.enabled ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(user.created_timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Dialog>
                        <DialogTrigger asChild>
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px]">
                          <DialogHeader>
                            <DialogTitle>{t('manageUserRoles')}</DialogTitle>
                          </DialogHeader>
                          {selectedUser && (
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                                  <span className="text-lg font-medium text-blue-600">
                                    {(selectedUser.first_name?.[0] || selectedUser.email[0]).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <h3 className="font-medium">{selectedUser.first_name} {selectedUser.last_name}</h3>
                                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                                </div>
                              </div>
                              
                              <div>
                                <h4 className="font-medium mb-2">{t('currentRoles')}</h4>
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {selectedUser.roles.map(role => (
                                    <div key={role} className="flex items-center gap-2">
                                      <RoleBadge role={role} />
                                      <button
                                        onClick={() => removeRole(selectedUser.id, role)}
                                        className="text-red-600 hover:text-red-800"
                                      >
                                        <UserX className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <h4 className="font-medium mb-2">{t('assignNewRole')}</h4>
                                <div className="flex flex-wrap gap-2">
                                  {roleOptions
                                    .filter(role => !selectedUser.roles.includes(role.value))
                                    .map(role => (
                                      <button
                                        key={role.value}
                                        onClick={() => assignRole(selectedUser.id, role.value)}
                                        className="flex items-center gap-2 px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                                      >
                                        <UserCheck className="h-4 w-4" />
                                        {role.label}
                                      </button>
                                    ))
                                  }
                                </div>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            {t('showingResults', { 
              start: (page - 1) * pageSize + 1, 
              end: Math.min(page * pageSize, total), 
              total 
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-2 text-sm text-gray-700">
              {t('pageOfTotal', { page, total: Math.ceil(total / pageSize) })}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(total / pageSize)}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 