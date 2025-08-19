'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  PlusIcon,
  DocumentDuplicateIcon,
  ChartBarIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline'

export default function QuickActions() {
  const t = useTranslations('Navigation')
  const tDashboard = useTranslations('Dashboard')
  const params = useParams()
  const locale = params.locale as string

  const actions = [
    {
      name: t('newAssessment'),
      description: tDashboard('descriptions.newAssessment'),
      href: `/${locale}/assessments/new`,
      icon: PlusIcon,
      color: 'bg-primary',
      primary: true
    },
    {
      name: tDashboard('duplicateAssessment'),
      description: tDashboard('descriptions.duplicateAssessment'),
      href: `/${locale}/assessments?action=duplicate`,
      icon: DocumentDuplicateIcon,
      color: 'bg-secondary'
    },
    {
      name: t('reports'),
      description: tDashboard('descriptions.reports'),
      href: `/${locale}/reports`,
      icon: ChartBarIcon,
      color: 'bg-accent'
    },
    {
      name: t('help'),
      description: tDashboard('descriptions.help'),
      href: `/${locale}/help`,
      icon: QuestionMarkCircleIcon,
      color: 'bg-info'
    }
  ]

  return (
    <div className="bg-base-100 rounded-lg shadow-sm border border-base-300 p-6">
      <h2 className="text-lg font-semibold text-base-content mb-4">
        {tDashboard('quickActions')}
      </h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action) => (
          <Link
            key={action.name}
            href={action.href}
            className={`
              group relative rounded-lg p-4 border transition-all duration-200
              ${action.primary 
                ? 'border-primary bg-primary/5 hover:bg-primary/10 hover:border-primary/60' 
                : 'border-base-300 bg-base-50 hover:bg-base-100 hover:border-base-400'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                flex h-10 w-10 items-center justify-center rounded-lg ${action.color} text-white
                group-hover:scale-110 transition-transform duration-200
              `}>
                <action.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`
                  text-sm font-semibold truncate
                  ${action.primary ? 'text-primary' : 'text-base-content'}
                `}>
                  {action.name}
                </p>
                <p className="text-xs text-base-content/70 mt-1 line-clamp-2">
                  {action.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}