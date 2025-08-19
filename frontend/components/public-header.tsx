'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'

interface PublicHeaderProps {
  locale: string
}

export function PublicHeader({ locale }: PublicHeaderProps) {
  const tHeader = useTranslations('Header')
  const tHomePage = useTranslations('HomePage')
  const { isAuthenticated, isLoading, login, register } = useAuth()

  return (
    <header className="navbar bg-base-100 shadow-lg">
      <div className="navbar-start">
        <Link href={`/${locale}`} className="btn btn-ghost text-xl">
          {tHeader('title')}
        </Link>
      </div>

      <div className="navbar-end space-x-4">
        {/* Language Switcher */}
        <div className="dropdown dropdown-end">
          <label tabIndex={0} className="btn btn-ghost btn-sm">
            {locale === 'hr' ? 'HR' : 'EN'}
          </label>
          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52"
          >
            <li>
              <Link href="/hr" locale="hr">
                Hrvatski
              </Link>
            </li>
            <li>
              <Link href="/en" locale="en">
                English
              </Link>
            </li>
          </ul>
        </div>

        {/* Auth Buttons */}
        {!isLoading && (
          <>
            {isAuthenticated ? (
              <Link href={`/${locale}/dashboard`} className="btn btn-primary">
                {tHomePage('cta.dashboard')}
              </Link>
            ) : (
              <>
                <button
                  onClick={() => login()}
                  className="btn btn-outline btn-primary"
                >
                  {tHomePage('cta.login')}
                </button>
                <button
                  onClick={() => register()}
                  className="btn btn-primary"
                >
                  {tHomePage('cta.register')}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </header>
  )
}