'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { 
  HomeIcon, 
  DocumentCheckIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  PlusIcon,
  DocumentTextIcon,
  DocumentIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'
import { useAssessments } from '@/hooks/api/use-assessments'
import { RoleGuard } from '@/components/role-guard'
import { useDocuments } from '@/hooks/api/use-documents'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations('Navigation')
  const pathname = usePathname()
  const params = useParams()
  const locale = params.locale as string

  // Get assessment count for display
  const { data: assessmentsData, isLoading, error } = useAssessments({ per_page: 1 })
  const assessmentCount = assessmentsData?.total || 0
  
  // Get document count for display (organization documents only)
  const { data: documentsData } = useDocuments({ 
    page: 1, 
    pageSize: 1, 
    includeGlobal: false  // Only organization documents
  })
  const documentCount = documentsData?.total || 0
  
  // Debug logging for sidebar counts
  console.log('[SIDEBAR] Assessment data:', { 
    assessmentCount, 
    total: assessmentsData?.total, 
    assessmentsLength: assessmentsData?.items?.length,
    isLoading, 
    error 
  })
  console.log('[SIDEBAR] Document data:', { 
    documentCount, 
    total: documentsData?.total, 
    documentsLength: documentsData?.documents?.length
  })

  const navigation = [
    {
      name: t('dashboard'),
      href: `/${locale}/dashboard`,
      icon: HomeIcon,
      current: pathname === `/${locale}/dashboard`,
    },
    {
      name: t('assessments'),
      href: `/${locale}/assessments`,
      icon: DocumentCheckIcon,
      current: pathname.startsWith(`/${locale}/assessments`),
      count: assessmentCount
    },
    {
      name: t('reports'),
      href: `/${locale}/reports`,
      icon: ChartBarIcon,
      current: pathname.startsWith(`/${locale}/reports`),
    },
    {
      name: t('documents'),
      href: `/${locale}/documents`,
      icon: DocumentIcon,
      current: pathname.startsWith(`/${locale}/documents`),
      count: documentCount
    },
  ]

  const secondaryNavigation = [
    {
      name: t('settings'),
      href: `/${locale}/settings`,
      icon: Cog6ToothIcon,
      current: pathname.startsWith(`/${locale}/settings`),
    },
    {
      name: t('help'),
      href: `/${locale}/help`,
      icon: QuestionMarkCircleIcon,
      current: pathname.startsWith(`/${locale}/help`),
    },
  ]

  const adminNavigation = [
    {
      name: 'Admin Panel',
      href: `/${locale}/admin`,
      icon: Cog6ToothIcon,
      current: pathname === `/${locale}/admin`,
    },
    {
      name: 'Global Documents',
      href: `/${locale}/admin/documents`,
      icon: GlobeAltIcon,
      current: pathname.startsWith(`/${locale}/admin/documents`),
    },
  ]

  const assessmentCategories = [
    { name: 'Osnovna razina', count: 227, color: 'bg-success' },
    { name: 'Srednja razina', count: 277, color: 'bg-warning' },
    { name: 'Napredna razina', count: 277, color: 'bg-error' },
  ]

  return (
    <>
      {/* Desktop sidebar */}
      <div className={`hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col`}>
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-base-100 border-r border-base-300 px-6 pb-4">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center">
            <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
              <DocumentTextIcon className="h-8 w-8 text-primary" />
              <div>
                <div className="text-lg font-bold text-base-content">AI Samoprocjena</div>
                <div className="text-xs text-base-content/60">ZKS/NIS2</div>
              </div>
            </Link>
          </div>

          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              {/* Main navigation */}
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => {
                    const navItem = (
                      <Link
                        href={item.href}
                        className={`
                          group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold
                          ${item.current
                            ? 'bg-primary text-primary-content'
                            : 'text-base-content hover:text-primary hover:bg-primary/10'
                          }
                          ${item.highlight ? 'ring-2 ring-primary ring-opacity-50' : ''}
                        `}
                      >
                        <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                        {item.name}
                        {item.count !== undefined && (
                          <span className={`
                            ml-auto rounded-full px-2.5 py-0.5 text-xs
                            ${item.current 
                              ? 'bg-primary-content text-primary' 
                              : 'bg-base-200 text-base-content/70'
                            }
                          `}>
                            {item.count}
                          </span>
                        )}
                      </Link>
                    )

                    if (item.requiredRoles) {
                      return (
                        <li key={item.name}>
                          <RoleGuard roles={item.requiredRoles}>
                            {navItem}
                          </RoleGuard>
                        </li>
                      )
                    }

                    return <li key={item.name}>{navItem}</li>
                  })}
                </ul>
              </li>

              {/* Assessment Categories */}
              <li>
                <div className="text-xs font-semibold leading-6 text-base-content/60 uppercase tracking-wider">
                  Sigurnosne razine
                </div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {assessmentCategories.map((category) => (
                    <li key={category.name}>
                      <div className="group flex gap-x-3 rounded-md p-2 text-sm leading-6">
                        <div className={`h-3 w-3 rounded-full ${category.color} mt-1 shrink-0`} />
                        <div className="flex-1">
                          <div className="text-base-content/80">{category.name}</div>
                          <div className="text-xs text-base-content/60">{category.count} kontrola</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>

              {/* Admin navigation */}
              <RoleGuard roles={['admin']}>
                <li>
                  <div className="text-xs font-semibold leading-6 text-base-content/60 uppercase tracking-wider">
                    Administration
                  </div>
                  <ul role="list" className="-mx-2 mt-2 space-y-1">
                    {adminNavigation.map((item) => (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={`
                            group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold
                            ${item.current
                              ? 'bg-primary text-primary-content'
                              : 'text-base-content hover:text-primary hover:bg-primary/10'
                            }
                          `}
                        >
                          <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              </RoleGuard>

              {/* Secondary navigation */}
              <li className="mt-auto">
                <ul role="list" className="-mx-2 space-y-1">
                  {secondaryNavigation.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={`
                          group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold
                          ${item.current
                            ? 'bg-primary text-primary-content'
                            : 'text-base-content hover:text-primary hover:bg-primary/10'
                          }
                        `}
                      >
                        <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile sidebar */}
      <div className={`lg:hidden ${isOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-y-0 z-50 w-64 overflow-y-auto bg-base-100 border-r border-base-300">
          <div className="flex h-16 shrink-0 items-center px-6">
            <Link href={`/${locale}/dashboard`} className="flex items-center gap-2" onClick={onClose}>
              <DocumentTextIcon className="h-8 w-8 text-primary" />
              <div>
                <div className="text-lg font-bold text-base-content">AI Samoprocjena</div>
                <div className="text-xs text-base-content/60">ZKS/NIS2</div>
              </div>
            </Link>
          </div>

          <nav className="flex flex-1 flex-col px-6 pb-4">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              {/* Main navigation */}
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`
                          group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold
                          ${item.current
                            ? 'bg-primary text-primary-content'
                            : 'text-base-content hover:text-primary hover:bg-primary/10'
                          }
                          ${item.highlight ? 'ring-2 ring-primary ring-opacity-50' : ''}
                        `}
                      >
                        <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                        {item.name}
                        {item.count !== undefined && (
                          <span className={`
                            ml-auto rounded-full px-2.5 py-0.5 text-xs
                            ${item.current 
                              ? 'bg-primary-content text-primary' 
                              : 'bg-base-200 text-base-content/70'
                            }
                          `}>
                            {item.count}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>

              {/* Assessment Categories */}
              <li>
                <div className="text-xs font-semibold leading-6 text-base-content/60 uppercase tracking-wider">
                  Sigurnosne razine
                </div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {assessmentCategories.map((category) => (
                    <li key={category.name}>
                      <div className="group flex gap-x-3 rounded-md p-2 text-sm leading-6">
                        <div className={`h-3 w-3 rounded-full ${category.color} mt-1 shrink-0`} />
                        <div className="flex-1">
                          <div className="text-base-content/80">{category.name}</div>
                          <div className="text-xs text-base-content/60">{category.count} kontrola</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>

              {/* Secondary navigation */}
              <li className="mt-auto">
                <ul role="list" className="-mx-2 space-y-1">
                  {secondaryNavigation.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`
                          group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold
                          ${item.current
                            ? 'bg-primary text-primary-content'
                            : 'text-base-content hover:text-primary hover:bg-primary/10'
                          }
                        `}
                      >
                        <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </>
  )
}