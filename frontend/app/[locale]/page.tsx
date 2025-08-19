'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChartBarIcon, DocumentTextIcon, CogIcon } from '@heroicons/react/24/outline'
import { PublicHeader } from '@/components/public-header'
import { useAuth } from '@/hooks/useAuth'

type Props = {
  params: { locale: string }
}

export default function HomePage({ params: { locale } }: Props) {
  const t = useTranslations('HomePage')
  const { isAuthenticated, login, register } = useAuth()

  return (
    <>
      <PublicHeader locale={locale} />
      <div className="min-h-screen bg-gradient-to-br from-primary/10 to-secondary/10">
        <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-primary mb-4 croatian-text">
            {t('title')}
          </h1>
          <p className="text-xl text-base-content/70 max-w-3xl mx-auto croatian-text">
            {t('description')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="assessment-card text-center">
            <ChartBarIcon className="w-16 h-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 croatian-text">{t('features.assessment.title')}</h3>
            <p className="text-base-content/70 croatian-text">{t('features.assessment.description')}</p>
          </div>

          <div className="assessment-card text-center">
            <DocumentTextIcon className="w-16 h-16 text-secondary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 croatian-text">{t('features.reporting.title')}</h3>
            <p className="text-base-content/70 croatian-text">{t('features.reporting.description')}</p>
          </div>

          <div className="assessment-card text-center">
            <CogIcon className="w-16 h-16 text-accent mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 croatian-text">{t('features.ai.title')}</h3>
            <p className="text-base-content/70 croatian-text">{t('features.ai.description')}</p>
          </div>
        </div>

        <div className="text-center">
          {isAuthenticated ? (
            <>
              <Link 
                href={`/${locale}/dashboard`} 
                className="btn btn-primary btn-lg mr-4"
              >
                {t('cta.dashboard')}
              </Link>
              <Link 
                href={`/${locale}/assessments/new`} 
                className="btn btn-secondary btn-lg"
              >
                {t('cta.newAssessment')}
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={() => login()}
                className="btn btn-primary btn-lg mr-4"
              >
                {t('cta.login')}
              </button>
              <button
                onClick={() => register()}
                className="btn btn-secondary btn-lg"
              >
                {t('cta.register')}
              </button>
            </>
          )}
        </div>

        <div className="mt-16 text-center">
          <div className="stats stats-vertical lg:stats-horizontal shadow">
            <div className="stat">
              <div className="stat-title croatian-text">{t('stats.measures')}</div>
              <div className="stat-value text-primary">13</div>
              <div className="stat-desc croatian-text">{t('stats.measuresDesc')}</div>
            </div>
            
            <div className="stat">
              <div className="stat-title croatian-text">{t('stats.controls')}</div>
              <div className="stat-value text-secondary">277</div>
              <div className="stat-desc croatian-text">{t('stats.controlsDesc')}</div>
            </div>
            
            <div className="stat">
              <div className="stat-title croatian-text">{t('stats.levels')}</div>
              <div className="stat-value text-accent">3</div>
              <div className="stat-desc croatian-text">{t('stats.levelsDesc')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}