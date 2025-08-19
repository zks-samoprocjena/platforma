import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ReactQueryProvider } from '@/providers/react-query-provider'
import { KeycloakProvider } from '@/lib/keycloak-provider'
import { LoggingProvider } from '@/hooks/use-logging'
import { Toaster } from 'react-hot-toast'

const locales = ['hr', 'en']

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  // Ensure that the incoming `locale` is valid
  if (!locales.includes(locale as any)) {
    notFound()
  }
  
  // Enable static rendering
  setRequestLocale(locale)
  
  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ReactQueryProvider>
        <KeycloakProvider>
          <LoggingProvider>
            <div className="min-h-screen bg-base-200">
              {children}
            </div>
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
          </LoggingProvider>
        </KeycloakProvider>
      </ReactQueryProvider>
    </NextIntlClientProvider>
  )
}