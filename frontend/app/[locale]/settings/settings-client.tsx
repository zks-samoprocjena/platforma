'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/hooks/useAuth'
import { useUserProfileManagement } from '@/hooks/api/use-user-profile'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Globe, 
  Database,
  Download,
  Trash2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  Building2,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Info,
  Badge
} from 'lucide-react'

interface UserSettings {
  // Profile (editable via API)
  job_title?: string
  department?: string
  phone?: string
  location?: string
  responsibilities?: string
  
  // Preferences (local settings)
  language: 'hr' | 'en'
  theme: 'light' | 'dark' | 'system'
  autoSave: boolean
  autoSaveInterval: number
  
  // Notifications (local settings)
  emailNotifications: boolean
  assessmentReminders: boolean
  complianceAlerts: boolean
  weeklyReports: boolean
  
  // Privacy & Security (local settings)
  dataRetention: number
  shareAnalytics: boolean
  twoFactorEnabled: boolean
  sessionTimeout: number
}

type SettingsSection = 'profile' | 'preferences' | 'notifications' | 'security' | 'data'

export function SettingsClient() {
  const t = useTranslations()
  const tSettings = useTranslations('Settings')
  const user = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // User profile management hook (replaces mock implementation)
  const {
    profile,
    isLoading: isProfileLoading,
    error: profileError,
    roles,
    isRolesLoading,
    rolesError,
    updateProfile,
    isUpdating,
    updateError,
    refetch,
    systemRoles,
    rolesSynced
  } = useUserProfileManagement()
  
  // Get section from URL parameters, default to 'profile'
  const sectionFromUrl = searchParams.get('section') as SettingsSection
  const validSections: SettingsSection[] = ['profile', 'preferences', 'notifications', 'security', 'data']
  const initialSection = validSections.includes(sectionFromUrl) ? sectionFromUrl : 'profile'
  
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const [settings, setSettings] = useState<UserSettings>({
    // Profile - Will be populated from API
    job_title: '',
    department: '',
    phone: '',
    location: '',
    responsibilities: '',
    
    // Preferences - Default values (these remain local)
    language: 'hr',
    theme: 'light',
    autoSave: true,
    autoSaveInterval: 30,
    
    // Notifications - Default values
    emailNotifications: true,
    assessmentReminders: true,
    complianceAlerts: true,
    weeklyReports: false,
    
    // Privacy & Security - Default values
    dataRetention: 24,
    shareAnalytics: false,
    twoFactorEnabled: false,
    sessionTimeout: 480
  })
  
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Combine loading states
  const isLoading = isProfileLoading || isRolesLoading || !user

  // Update settings when profile data is available
  useEffect(() => {
    if (profile) {
      setSettings(prevSettings => ({
        ...prevSettings,
        job_title: profile.job_title || '',
        department: profile.department || '',
        phone: profile.phone || '',
        location: profile.location || '',
        responsibilities: profile.responsibilities || '',
      }))
    }
  }, [profile])

  // Update active section when URL changes
  useEffect(() => {
    const section = searchParams.get('section') as SettingsSection
    if (section && validSections.includes(section)) {
      setActiveSection(section)
    }
  }, [searchParams])

  const handleSectionChange = (section: SettingsSection) => {
    setActiveSection(section)
    // Update URL without page reload
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('section', section)
    router.push(newUrl.pathname + newUrl.search, { scroll: false })
  }

  const handleSettingChange = (key: keyof UserSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setUnsavedChanges(true)
  }

  const handleSave = async () => {
    if (!unsavedChanges) return
    
    // Extract only profile fields that can be updated via API
    const profileData = {
      job_title: settings.job_title,
      department: settings.department,
      phone: settings.phone,
      location: settings.location,
      responsibilities: settings.responsibilities,
    }
    
    // Update profile via API
    updateProfile(profileData)
    
    // Reset unsaved changes flag
    setUnsavedChanges(false)
    
    // Note: Success/error handling is done in the hook via toast notifications
  }

  const handleExportData = () => {
    // TODO: Implement data export
    console.log('Exporting user data...')
  }

  const handleDeleteAccount = () => {
    // TODO: Implement account deletion with confirmation
    console.log('Delete account requested...')
  }

  const sections = [
    { id: 'profile', icon: User, label: tSettings('navigation.profile') },
    { id: 'preferences', icon: Palette, label: tSettings('navigation.preferences') },
    { id: 'notifications', icon: Bell, label: tSettings('navigation.notifications') },
    { id: 'security', icon: Shield, label: tSettings('navigation.security') },
    { id: 'data', icon: Database, label: tSettings('navigation.data') }
  ] as const

  // Show loading state while user data is being fetched
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">
            {tSettings('header.title')}
          </h1>
          <p className="text-lg text-base-content/70">
            {tSettings('header.subtitle')}
          </p>
        </div>
        
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="assessment-card">
              <div className="animate-pulse space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 bg-base-200 rounded-lg"></div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-3">
            <div className="assessment-card">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-base-200 rounded w-1/3"></div>
                <div className="space-y-3">
                  <div className="h-12 bg-base-200 rounded"></div>
                  <div className="h-12 bg-base-200 rounded"></div>
                  <div className="h-12 bg-base-200 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">
            {tSettings('header.title')}
          </h1>
          <p className="text-lg text-base-content/70">
            {tSettings('header.subtitle')}
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="assessment-card">
              <nav className="space-y-2">
                {sections.map(section => {
                  const Icon = section.icon
                  return (
                    <button
                      key={section.id}
                      onClick={() => handleSectionChange(section.id as SettingsSection)}
                      className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-all duration-200 ${
                        activeSection === section.id
                          ? 'bg-primary text-primary-content'
                          : 'hover:bg-base-200 text-base-content'
                      }`}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      <span>{section.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="assessment-card">
              {/* Profile Section */}
              {activeSection === 'profile' && (
                <div>
                  <div className="flex items-center mb-6">
                    <User className="h-6 w-6 text-primary mr-3" />
                    <h2 className="text-2xl font-semibold">{tSettings('profile.title')}</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Read-only user information */}
                      <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">{tSettings('profile.name.label')}</span>
                          </label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                            <input
                              type="text"
                              value={profile?.name || user?.name || ''}
                              className="form-input pl-10 bg-base-200 cursor-not-allowed"
                              placeholder={tSettings('profile.name.placeholder')}
                              disabled
                            />
                          </div>
                          <div className="label">
                            <span className="label-text-alt text-base-content/60">
                              {tSettings('profile.readOnlyHint')}
                            </span>
                          </div>
                        </div>

                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">{tSettings('profile.email.label')}</span>
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                            <input
                              type="email"
                              value={profile?.email || user?.email || ''}
                              className="form-input pl-10 bg-base-200 cursor-not-allowed"
                              placeholder={tSettings('profile.email.placeholder')}
                              disabled
                            />
                          </div>
                          <div className="label">
                            <span className="label-text-alt text-base-content/60">
                              {tSettings('profile.readOnlyHint')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* System roles (read-only) */}
                      <div className="form-control mb-6">
                        <label className="label">
                          <span className="label-text font-medium">{tSettings('profile.systemRoles.label')}</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {systemRoles.length > 0 ? (
                            systemRoles.map(role => (
                              <div key={role} className="badge badge-primary gap-2">
                                <Badge className="h-3 w-3" />
                                {role}
                              </div>
                            ))
                          ) : (
                            <div className="text-base-content/60">
                              {tSettings('profile.systemRoles.noRoles')}
                            </div>
                          )}
                        </div>
                        <div className="label">
                          <span className="label-text-alt text-base-content/60">
                            {tSettings('profile.systemRoles.hint')}
                          </span>
                        </div>
                        
                        {/* Role sync status */}
                        {!rolesSynced && (
                          <div className="alert alert-warning mt-2">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm">
                              {tSettings('profile.systemRoles.outOfSync')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Organization (read-only) */}
                      <div className="form-control mb-6">
                        <label className="label">
                          <span className="label-text font-medium">{tSettings('profile.organization.label')}</span>
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                          <input
                            type="text"
                            value={profile?.organization_name || user?.organizationName || ''}
                            className="form-input pl-10 bg-base-200 cursor-not-allowed"
                            placeholder={tSettings('profile.organization.placeholder')}
                            disabled
                          />
                        </div>
                        <div className="label">
                          <span className="label-text-alt text-base-content/60">
                            {tSettings('profile.readOnlyHint')}
                          </span>
                        </div>
                      </div>

                      {/* Separator */}
                      <div className="divider">
                        <span className="text-base-content/70">{tSettings('profile.editableSection')}</span>
                      </div>

                      {/* Editable profile fields */}
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">{tSettings('profile.jobTitle.label')}</span>
                          </label>
                          <input
                            type="text"
                            value={settings.job_title || ''}
                            onChange={(e) => handleSettingChange('job_title', e.target.value)}
                            className="form-input"
                            placeholder={tSettings('profile.jobTitle.placeholder')}
                          />
                        </div>

                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">{tSettings('profile.department.label')}</span>
                          </label>
                          <input
                            type="text"
                            value={settings.department || ''}
                            onChange={(e) => handleSettingChange('department', e.target.value)}
                            className="form-input"
                            placeholder={tSettings('profile.department.placeholder')}
                          />
                        </div>

                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">{tSettings('profile.phone.label')}</span>
                          </label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                            <input
                              type="tel"
                              value={settings.phone || ''}
                              onChange={(e) => handleSettingChange('phone', e.target.value)}
                              className="form-input pl-10"
                              placeholder={tSettings('profile.phone.placeholder')}
                            />
                          </div>
                        </div>

                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-medium">{tSettings('profile.location.label')}</span>
                          </label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                            <input
                              type="text"
                              value={settings.location || ''}
                              onChange={(e) => handleSettingChange('location', e.target.value)}
                              className="form-input pl-10"
                              placeholder={tSettings('profile.location.placeholder')}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Responsibilities field (full width) */}
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">{tSettings('profile.responsibilities.label')}</span>
                        </label>
                        <textarea
                          value={settings.responsibilities || ''}
                          onChange={(e) => handleSettingChange('responsibilities', e.target.value)}
                          className="textarea textarea-bordered h-24"
                          placeholder={tSettings('profile.responsibilities.placeholder')}
                        ></textarea>
                      </div>
                    </div>

                    {/* Display additional user info from Keycloak */}
                    {user && (
                      <div className="mt-6 p-4 bg-base-200 rounded-lg">
                        <h3 className="font-medium text-base-content mb-3">{tSettings('profile.accountInfo.title')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-base-content/70">{tSettings('profile.accountInfo.userId')}</span>
                            <span className="ml-2 font-mono">{user.id}</span>
                          </div>
                          {user.roles.length > 0 && (
                            <div>
                              <span className="text-base-content/70">{tSettings('profile.accountInfo.systemRoles')}</span>
                              <span className="ml-2">{user.roles.join(', ')}</span>
                            </div>
                          )}
                          {user.organizationId && (
                            <div>
                              <span className="text-base-content/70">{tSettings('profile.accountInfo.organizationId')}</span>
                              <span className="ml-2 font-mono">{user.organizationId}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Preferences Section */}
              {activeSection === 'preferences' && (
                <div>
                  <div className="flex items-center mb-6">
                    <Palette className="h-6 w-6 text-primary mr-3" />
                    <h2 className="text-2xl font-semibold">{tSettings('preferences.title')}</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">{tSettings('preferences.language.label')}</span>
                        </label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-base-content/50" />
                          <select
                            value={settings.language}
                            onChange={(e) => handleSettingChange('language', e.target.value)}
                            className="select select-bordered w-full pl-10"
                          >
                            <option value="hr">{tSettings('preferences.language.options.hr')}</option>
                            <option value="en">{tSettings('preferences.language.options.en')}</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">{tSettings('preferences.theme.label')}</span>
                        </label>
                        <select
                          value={settings.theme}
                          onChange={(e) => handleSettingChange('theme', e.target.value)}
                          className="select select-bordered w-full"
                        >
                          <option value="light">{tSettings('preferences.theme.options.light')}</option>
                          <option value="dark">{tSettings('preferences.theme.options.dark')}</option>
                          <option value="system">{tSettings('preferences.theme.options.system')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                        <div>
                          <h4 className="font-medium">{tSettings('preferences.autoSave.title')}</h4>
                          <p className="text-sm text-base-content/70">
                            {tSettings('preferences.autoSave.description')}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.autoSave}
                          onChange={(e) => handleSettingChange('autoSave', e.target.checked)}
                          className="toggle toggle-primary"
                        />
                      </div>

                      {settings.autoSave && (
                        <div className="form-control ml-6">
                          <label className="label">
                            <span className="label-text">{tSettings('preferences.autoSave.intervalLabel')}</span>
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="120"
                            value={settings.autoSaveInterval}
                            onChange={(e) => handleSettingChange('autoSaveInterval', parseInt(e.target.value))}
                            className="range range-primary"
                          />
                          <div className="w-full flex justify-between text-xs px-2">
                            <span>10s</span>
                            <span>30s</span>
                            <span>60s</span>
                            <span>120s</span>
                          </div>
                          <div className="text-center text-sm text-base-content/70 mt-2">
                            {tSettings('preferences.autoSave.currentInterval', { seconds: settings.autoSaveInterval })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Section */}
              {activeSection === 'notifications' && (
                <div>
                  <div className="flex items-center mb-6">
                    <Bell className="h-6 w-6 text-primary mr-3" />
                    <h2 className="text-2xl font-semibold">{tSettings('notifications.title')}</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                      <div>
                        <h4 className="font-medium">{tSettings('notifications.emailNotifications.title')}</h4>
                        <p className="text-sm text-base-content/70">
                          {tSettings('notifications.emailNotifications.description')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.emailNotifications}
                        onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                        className="toggle toggle-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                      <div>
                        <h4 className="font-medium">{tSettings('notifications.assessmentReminders.title')}</h4>
                        <p className="text-sm text-base-content/70">
                          {tSettings('notifications.assessmentReminders.description')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.assessmentReminders}
                        onChange={(e) => handleSettingChange('assessmentReminders', e.target.checked)}
                        className="toggle toggle-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                      <div>
                        <h4 className="font-medium">{tSettings('notifications.complianceAlerts.title')}</h4>
                        <p className="text-sm text-base-content/70">
                          {tSettings('notifications.complianceAlerts.description')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.complianceAlerts}
                        onChange={(e) => handleSettingChange('complianceAlerts', e.target.checked)}
                        className="toggle toggle-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                      <div>
                        <h4 className="font-medium">{tSettings('notifications.weeklyReports.title')}</h4>
                        <p className="text-sm text-base-content/70">
                          {tSettings('notifications.weeklyReports.description')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.weeklyReports}
                        onChange={(e) => handleSettingChange('weeklyReports', e.target.checked)}
                        className="toggle toggle-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Security Section */}
              {activeSection === 'security' && (
                <div>
                  <div className="flex items-center mb-6">
                    <Shield className="h-6 w-6 text-primary mr-3" />
                    <h2 className="text-2xl font-semibold">{tSettings('security.title')}</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="p-4 border-l-4 border-l-warning bg-warning/10 rounded-r-lg">
                      <div className="flex items-start">
                        <AlertTriangle className="h-5 w-5 text-warning mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-warning-content mb-1">{tSettings('security.recommendation.title')}</h4>
                          <p className="text-sm text-base-content/70">
                            {tSettings('security.recommendation.description')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                      <div>
                        <h4 className="font-medium">{tSettings('security.twoFactor.title')}</h4>
                        <p className="text-sm text-base-content/70">
                          {tSettings('security.twoFactor.description')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {settings.twoFactorEnabled ? (
                          <span className="badge badge-success">{tSettings('security.twoFactor.enabled')}</span>
                        ) : (
                          <span className="badge badge-warning">{tSettings('security.twoFactor.disabled')}</span>
                        )}
                        <button className="btn btn-outline btn-sm">
                          {settings.twoFactorEnabled ? tSettings('security.twoFactor.disable') : tSettings('security.twoFactor.enable')}
                        </button>
                      </div>
                    </div>

                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-medium">{tSettings('security.sessionTimeout.label')}</span>
                      </label>
                      <select
                        value={settings.sessionTimeout}
                        onChange={(e) => handleSettingChange('sessionTimeout', parseInt(e.target.value))}
                        className="select select-bordered w-full"
                      >
                        <option value={60}>{tSettings('security.sessionTimeout.options.60')}</option>
                        <option value={240}>{tSettings('security.sessionTimeout.options.240')}</option>
                        <option value={480}>{tSettings('security.sessionTimeout.options.480')}</option>
                        <option value={720}>{tSettings('security.sessionTimeout.options.720')}</option>
                        <option value={1440}>{tSettings('security.sessionTimeout.options.1440')}</option>
                      </select>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">{tSettings('security.passwordManagement.title')}</h4>
                      <div className="grid gap-3">
                        <button className="btn btn-outline w-full justify-start">
                          <Key className="h-4 w-4 mr-2" />
                          {tSettings('security.passwordManagement.changePassword')}
                        </button>
                        <button className="btn btn-outline w-full justify-start">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {tSettings('security.passwordManagement.generatePassword')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Section */}
              {activeSection === 'data' && (
                <div>
                  <div className="flex items-center mb-6">
                    <Database className="h-6 w-6 text-primary mr-3" />
                    <h2 className="text-2xl font-semibold">{tSettings('data.title')}</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="p-4 border-l-4 border-l-info bg-info/10 rounded-r-lg">
                      <div className="flex items-start">
                        <Info className="h-5 w-5 text-info mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-info-content mb-1">{tSettings('data.gdprCompliance.title')}</h4>
                          <p className="text-sm text-base-content/70">
                            {tSettings('data.gdprCompliance.description')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-medium">{tSettings('data.dataRetention.label')}</span>
                      </label>
                      <select
                        value={settings.dataRetention}
                        onChange={(e) => handleSettingChange('dataRetention', parseInt(e.target.value))}
                        className="select select-bordered w-full"
                      >
                        <option value={12}>{tSettings('data.dataRetention.options.12')}</option>
                        <option value={24}>{tSettings('data.dataRetention.options.24')}</option>
                        <option value={36}>{tSettings('data.dataRetention.options.36')}</option>
                        <option value={60}>{tSettings('data.dataRetention.options.60')}</option>
                        <option value={84}>{tSettings('data.dataRetention.options.84')}</option>
                      </select>
                      <div className="label">
                        <span className="label-text-alt text-base-content/70">
                          {tSettings('data.dataRetention.recommendation')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                      <div>
                        <h4 className="font-medium">{tSettings('data.shareAnalytics.title')}</h4>
                        <p className="text-sm text-base-content/70">
                          {tSettings('data.shareAnalytics.description')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.shareAnalytics}
                        onChange={(e) => handleSettingChange('shareAnalytics', e.target.checked)}
                        className="toggle toggle-primary"
                      />
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">{tSettings('data.exportAndDelete.title')}</h4>
                      <div className="grid gap-3">
                        <button 
                          onClick={handleExportData}
                          className="btn btn-outline w-full justify-start"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {tSettings('data.exportAndDelete.exportData')}
                        </button>
                        <button 
                          onClick={handleDeleteAccount}
                          className="btn btn-error btn-outline w-full justify-start"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {tSettings('data.exportAndDelete.deleteAccount')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Actions */}
              <div className="mt-8 pt-6 border-t border-base-300">
                <div className="flex flex-col sm:flex-row gap-4 justify-between">
                  <div className="flex items-center gap-2">
                    {unsavedChanges && (
                      <div className="flex items-center text-warning">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        <span className="text-sm">{tSettings('actions.unsavedChanges')}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        // Reset to original values
                        setUnsavedChanges(false)
                      }}
                      className="btn btn-ghost"
                      disabled={!unsavedChanges}
                    >
                      {tSettings('actions.cancel')}
                    </button>
                    <button 
                      onClick={handleSave}
                      className="btn btn-primary"
                      disabled={isUpdating || !unsavedChanges}
                    >
                      {isUpdating ? (
                        <>
                          <span className="loading loading-spinner loading-sm mr-2"></span>
                          {tSettings('actions.saving')}
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          {tSettings('actions.save')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}