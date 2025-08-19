'use client'

import React, { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Bars3Icon,
  BellIcon,
  UserCircleIcon,
  ChevronDownIcon,
  LanguageIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useAuth, useUser } from '@/hooks/useAuth'
import { toast } from 'react-hot-toast'

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const t = useTranslations('Navigation')
  const params = useParams()
  const locale = params.locale as string
  const { logout, isAuthenticated } = useAuth()
  const user = useUser()
  
  const [userMenuOpen, setUserMenuOpen] = React.useState(false)
  const [langMenuOpen, setLangMenuOpen] = React.useState(false)
  const [authErrorShown, setAuthErrorShown] = React.useState(false)
  
  // Check for authentication errors
  useEffect(() => {
    if (isAuthenticated && !user && !authErrorShown) {
      console.error('[Header] CRITICAL: User is authenticated but no user data available')
      console.error('[Header] This indicates a serious authentication state issue')
      toast.error('Authentication error: Unable to load user data. Please logout and login again.')
      setAuthErrorShown(true)
      
      // Log additional debug info
      if (typeof window !== 'undefined' && (window as any).keycloak) {
        const keycloak = (window as any).keycloak
        console.error('[Header] Keycloak state:', {
          authenticated: keycloak.authenticated,
          token: keycloak.token ? 'present' : 'missing',
          tokenParsed: keycloak.tokenParsed,
          subject: keycloak.subject
        })
      }
    }
  }, [isAuthenticated, user, authErrorShown])
  
  const [notifications, setNotifications] = React.useState([
    {
      id: 1,
      title: 'Nova samoprocjena dostupna',
      message: 'Možete započeti s novom samoprocjenom za Q2 2024',
      time: '2 min',
      read: false
    },
    {
      id: 2,
      title: 'Ažuriranje propisa',
      message: 'Nova verzija ZKS propisa je objavljena',
      time: '1h',
      read: false
    }
  ])

  const handleLogout = () => {
    logout()
    setUserMenuOpen(false)
  }

  const switchLanguage = (newLocale: string) => {
    const currentPath = window.location.pathname
    const newPath = currentPath.replace(`/${locale}`, `/${newLocale}`)
    window.location.href = newPath
  }

  return (
    <div className="sticky top-0 z-40 bg-base-100 border-b border-base-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          {/* Mobile menu button */}
          <div className="flex items-center">
            <button
              type="button"
              className="lg:hidden -ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-base-content hover:text-primary focus:outline-none"
              onClick={onMenuClick}
            >
              <span className="sr-only">Otvori glavni meni</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Right side items */}
          <div className="flex items-center gap-x-4 lg:gap-x-6">
            {/* Language switcher */}
            <div className="relative">
              <button
                type="button"
                className="flex items-center gap-x-1 text-sm leading-6 text-base-content hover:text-primary"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
              >
                <LanguageIcon className="h-5 w-5" aria-hidden="true" />
                <span className="hidden sm:block">{locale.toUpperCase()}</span>
                <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
              </button>

              {langMenuOpen && (
                <div className="absolute right-0 z-10 mt-2 w-32 origin-top-right rounded-md bg-base-100 py-2 shadow-lg ring-1 ring-base-300">
                  <button
                    onClick={() => {
                      switchLanguage('hr')
                      setLangMenuOpen(false)
                    }}
                    className={`
                      block w-full px-3 py-1 text-left text-sm
                      ${locale === 'hr' ? 'bg-primary/10 text-primary' : 'text-base-content hover:bg-base-200'}
                    `}
                  >
                    Hrvatski
                  </button>
                  <button
                    onClick={() => {
                      switchLanguage('en')
                      setLangMenuOpen(false)
                    }}
                    className={`
                      block w-full px-3 py-1 text-left text-sm
                      ${locale === 'en' ? 'bg-primary/10 text-primary' : 'text-base-content hover:bg-base-200'}
                    `}
                  >
                    English
                  </button>
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="dropdown dropdown-end">
              <button
                tabIndex={0}
                className="btn btn-ghost btn-circle"
                title="Obavijesti"
              >
                <div className="indicator">
                  <BellIcon className="h-5 w-5" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="badge badge-xs badge-primary indicator-item">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </div>
              </button>
              <div className="dropdown-content z-[1] card card-compact w-80 p-2 shadow bg-base-100 border border-base-300">
                <div className="card-body">
                  <h3 className="card-title text-sm">Obavijesti</h3>
                  <div className="space-y-2">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`
                          p-3 rounded-md border
                          ${notification.read ? 'bg-base-100 border-base-300' : 'bg-primary/5 border-primary/20'}
                        `}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-base-content">
                              {notification.title}
                            </p>
                            <p className="text-xs text-base-content/70 mt-1">
                              {notification.message}
                            </p>
                          </div>
                          <span className="text-xs text-base-content/60 ml-2">
                            {notification.time}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="card-actions justify-end">
                    <button className="btn btn-ghost btn-xs">Prikaži sve</button>
                  </div>
                </div>
              </div>
            </div>

            {/* User menu */}
            <div className="relative">
              {!user && isAuthenticated ? (
                <div className="flex items-center gap-x-2 text-error">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  <span className="text-sm font-medium">Auth Error</span>
                  <button
                    onClick={handleLogout}
                    className="btn btn-error btn-xs ml-2"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-x-1 text-sm leading-6 text-base-content hover:text-primary"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <UserCircleIcon className="h-8 w-8" aria-hidden="true" />
                  <span className="hidden lg:flex lg:items-center">
                    {user?.name ? (
                      <span className="ml-2 text-sm font-semibold">
                        {user.name}
                      </span>
                    ) : (
                      <span className="ml-2 text-sm text-error flex items-center gap-1">
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        Error
                      </span>
                    )}
                    <ChevronDownIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
              )}

              {userMenuOpen && (
                <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-base-100 py-2 shadow-lg ring-1 ring-base-300">
                  <div className="px-3 py-2 border-b border-base-300">
                    {user ? (
                      <>
                        <p className="text-sm font-medium text-base-content">
                          {user.name || <span className="text-error">Missing name</span>}
                        </p>
                        <p className="text-xs text-base-content/70">
                          {user.email || <span className="text-error">Missing email</span>}
                        </p>
                        {user.organizationName && (
                          <p className="text-xs text-base-content/50 mt-1">
                            {user.organizationName}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-error">
                        Authentication error: No user data available
                      </p>
                    )}
                  </div>
                  
                  <Link
                    href={`/${locale}/settings?section=profile`}
                    className="flex items-center gap-x-2 px-3 py-2 text-sm text-base-content hover:bg-base-200"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <UserCircleIcon className="h-4 w-4" />
                    Profil
                  </Link>
                  
                  <Link
                    href={`/${locale}/settings?section=preferences`}
                    className="flex items-center gap-x-2 px-3 py-2 text-sm text-base-content hover:bg-base-200"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Cog6ToothIcon className="h-4 w-4" />
                    Postavke
                  </Link>
                  
                  <hr className="my-2 border-base-300" />
                  
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-x-2 px-3 py-2 text-sm text-base-content hover:bg-base-200"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    {t('logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}