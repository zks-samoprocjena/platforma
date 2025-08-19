'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useUser, useOrganization } from '@/hooks/useAuth'
import { Building2, Globe, Users, Shield, ChevronRight, Check } from 'lucide-react'
import { apiEndpoints } from '@/lib/api-config'
import { refreshKeycloakSession } from '@/lib/auth-refresh'
import { toast } from 'react-hot-toast'

type OrganizationType = 'government' | 'private-sector' | 'critical-infrastructure' | 'other'
type SecurityLevel = 'osnovna' | 'srednja' | 'napredna'
type OrganizationSize = '1-10' | '11-50' | '51-250' | '250+'

interface OrganizationFormData {
  name: string
  code: string
  type: OrganizationType
  securityLevel: SecurityLevel
  website: string
  size: OrganizationSize
  description: string
}

interface OrganizationSetupClientProps {
  locale: string
}

export function OrganizationSetupClient({ locale }: OrganizationSetupClientProps) {
  const t = useTranslations('Organization')
  const router = useRouter()
  const user = useUser()
  const { organizationId } = useOrganization()
  
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<OrganizationFormData>({
    name: '',
    code: '',
    type: 'other',
    securityLevel: 'osnovna',
    website: '',
    size: '1-10',
    description: ''
  })

  // Generate code from name
  useEffect(() => {
    if (formData.name && !formData.code) {
      const generateCode = async () => {
        try {
          const response = await fetch(apiEndpoints.organizations.generateCode, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(window as any).keycloak?.token}`
            },
            body: JSON.stringify({ name: formData.name })
          })
          
          if (response.ok) {
            const data = await response.json()
            setFormData(prev => ({ ...prev, code: data.code }))
          }
        } catch (error) {
          console.error('Failed to generate code:', error)
        }
      }
      
      const timer = setTimeout(generateCode, 500)
      return () => clearTimeout(timer)
    }
  }, [formData.name])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Check if organization exists
      const checkResponse = await fetch(apiEndpoints.organizations.check, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(window as any).keycloak?.token}`
        },
        body: JSON.stringify({ 
          name: formData.name,
          code: formData.code 
        })
      })

      const checkData = await checkResponse.json()
      
      if (checkData.exists) {
        // Organization exists, assign user to it
        // TODO: Update Keycloak user attributes via backend
        toast.success(t('setup.organizationExists', { name: formData.name }))
        // Redirect to login to force token refresh
        setTimeout(() => {
          window.location.href = `/${locale}/auth/signin`
        }, 2000)
      } else {
        // Create new organization
        // Map frontend field names to backend field names
        const requestData = {
          name: formData.name,
          code: formData.code,
          type: formData.type,
          security_level: formData.securityLevel,  // Convert camelCase to snake_case
          website: formData.website,
          size: formData.size,
          admin_user_id: user?.id || ''
        }
        console.log('Sending organization registration:', requestData)
        
        const createResponse = await fetch(apiEndpoints.organizations.register, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(window as any).keycloak?.token}`
          },
          body: JSON.stringify(requestData)
        })

        if (createResponse.ok) {
          const orgData = await createResponse.json()
          
          // TODO: Update Keycloak user attributes
          // In production, this would be done via backend API that updates Keycloak
          console.log('Organization created:', orgData)
          
          // Check if setup is already marked as complete
          if (!orgData.requires_setup) {
            console.log('Organization setup already complete, redirecting to dashboard')
          } else {
            console.log('Note: User needs to logout and login again to refresh token with organization info')
          }
          
          // Show success message
          toast.success('Organization setup complete!')
          
          // Store organization info in session storage temporarily
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('organizationSetupComplete', 'true')
            sessionStorage.setItem('organizationId', orgData.organization_id)
            sessionStorage.setItem('organizationName', formData.name)
          }
          
          // Wait a moment for the backend to complete
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Redirect to dashboard
          // The organization check should now pass because setup_completed is true
          window.location.href = `/${locale}/dashboard`
        } else {
          const error = await createResponse.json()
          console.error('Registration error response:', error)
          toast.error(t('setup.createError', { error: error.detail || 'Unknown error' }))
        }
      }
    } catch (error) {
      console.error('Failed to setup organization:', error)
      toast.error(t('setup.setupError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 to-base-300">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <Building2 className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold text-base-content mb-2">
              {t('setup.title')}
            </h1>
            <p className="text-lg text-base-content/70">
              {t('setup.subtitle')}
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center ${step >= 1 ? 'text-primary' : 'text-base-content/30'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step >= 1 ? 'bg-primary text-primary-content' : 'bg-base-300'
                }`}>
                  {step > 1 ? <Check className="h-5 w-5" /> : '1'}
                </div>
                <span className="ml-2 font-medium">{t('setup.basicInfo')}</span>
              </div>
              
              <ChevronRight className="h-5 w-5 text-base-content/30" />
              
              <div className={`flex items-center ${step >= 2 ? 'text-primary' : 'text-base-content/30'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step >= 2 ? 'bg-primary text-primary-content' : 'bg-base-300'
                }`}>
                  {step > 2 ? <Check className="h-5 w-5" /> : '2'}
                </div>
                <span className="ml-2 font-medium">{t('setup.details')}</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-base-100 rounded-2xl shadow-xl p-8">
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold mb-6">{t('setup.basicInfo')}</h2>
                
                {/* Organization Name */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.name')}</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input input-bordered w-full"
                    placeholder={t('setup.namePlaceholder')}
                    required
                  />
                </div>

                {/* Organization Code */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.code')}</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="input input-bordered w-full"
                    placeholder={t('setup.codePlaceholder')}
                    required
                  />
                  <label className="label">
                    <span className="label-text-alt">{t('setup.codeHint')}</span>
                  </label>
                </div>

                {/* Organization Type */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.type')}</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as OrganizationType })}
                    className="select select-bordered w-full"
                    required
                  >
                    <option value="government">{t('setup.organizationTypes.government')}</option>
                    <option value="private-sector">{t('setup.organizationTypes.private-sector')}</option>
                    <option value="critical-infrastructure">{t('setup.organizationTypes.critical-infrastructure')}</option>
                    <option value="other">{t('setup.organizationTypes.other')}</option>
                  </select>
                </div>

                {/* Security Level */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.securityLevel')}</span>
                    <span className="label-text-alt text-error">*</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['osnovna', 'srednja', 'napredna'] as SecurityLevel[]).map((level) => (
                      <label
                        key={level}
                        className={`card cursor-pointer transition-all ${
                          formData.securityLevel === level 
                            ? 'ring-2 ring-primary bg-primary/10' 
                            : 'bg-base-200 hover:bg-base-300'
                        }`}
                      >
                        <div className="card-body p-4">
                          <div className="flex items-center space-x-3">
                            <input
                              type="radio"
                              name="securityLevel"
                              value={level}
                              checked={formData.securityLevel === level}
                              onChange={(e) => setFormData({ ...formData, securityLevel: e.target.value as SecurityLevel })}
                              className="radio radio-primary"
                            />
                            <div>
                              <h4 className="font-semibold capitalize">{level}</h4>
                              <p className="text-sm text-base-content/70">
                                {t(`setup.securityLevelDesc.${level}`)}
                              </p>
                            </div>
                          </div>
                          <Shield className={`h-8 w-8 mt-2 ${
                            level === 'osnovna' ? 'text-success' :
                            level === 'srednja' ? 'text-warning' :
                            'text-error'
                          }`} />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="btn btn-primary"
                    disabled={!formData.name || !formData.code}
                  >
                    {t('setup.next')}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold mb-6">{t('setup.additionalInfo')}</h2>

                {/* Website */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.website')}</span>
                  </label>
                  <div className="input-group">
                    <span className="bg-base-200">
                      <Globe className="h-4 w-4" />
                    </span>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="input input-bordered flex-1"
                      placeholder={t('setup.websitePlaceholder')}
                    />
                  </div>
                </div>

                {/* Organization Size */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.size')}</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(['1-10', '11-50', '51-250', '250+'] as OrganizationSize[]).map((size) => (
                      <label
                        key={size}
                        className={`card cursor-pointer transition-all ${
                          formData.size === size 
                            ? 'ring-2 ring-primary bg-primary/10' 
                            : 'bg-base-200 hover:bg-base-300'
                        }`}
                      >
                        <div className="card-body p-4 text-center">
                          <input
                            type="radio"
                            name="size"
                            value={size}
                            checked={formData.size === size}
                            onChange={(e) => setFormData({ ...formData, size: e.target.value as OrganizationSize })}
                            className="radio radio-primary"
                          />
                          <Users className="h-6 w-6 mx-auto my-2" />
                          <span className="font-medium">{size}</span>
                          <span className="text-xs text-base-content/70">{t('setup.sizeLabel')}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="label">
                    <span className="label-text font-medium">{t('setup.description')}</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="textarea textarea-bordered w-full"
                    rows={4}
                    placeholder={t('setup.descriptionPlaceholder')}
                  />
                </div>

                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn btn-ghost"
                  >
                    {t('setup.back')}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="loading loading-spinner loading-sm mr-2"></span>
                        {t('setup.setting')}
                      </>
                    ) : (
                      <>
                        {t('setup.complete')}
                        <Check className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Info Box */}
          <div className="mt-8 p-6 bg-info/10 rounded-lg border border-info/20">
            <h3 className="font-semibold text-info-content mb-2">{t('setup.whyNeeded')}</h3>
            <p className="text-sm text-base-content/70">
              {t('setup.whyNeededDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}