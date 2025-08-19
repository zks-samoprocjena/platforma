import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'

const locales = ['hr', 'en']
const defaultLocale = 'hr'

// Create the internationalization middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always'
})

// Define public paths that don't require authentication
const publicPaths = [
  '/',
  '/hr',
  '/en',
  '/hr/auth/signin',
  '/en/auth/signin',
  '/hr/auth/register',
  '/en/auth/register',
  '/hr/auth/error',
  '/en/auth/error',
  '/hr/auth/logout',
  '/en/auth/logout',
  '/api/auth',
  '/silent-check-sso.html'
]

// Define role-based access control
const roleBasedPaths = {
  '/admin': ['admin'],
  '/assessments/new': ['assessment_editor', 'admin'],
  '/assessments/[id]/edit': ['assessment_editor', 'admin'],
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Handle internationalization first
  const response = intlMiddleware(request)

  // Check if the path is public
  const isPublicPath = publicPaths.some(path => 
    pathname === path || pathname.startsWith(path + '/')
  )

  if (isPublicPath) {
    return response
  }

  // Check for Keycloak authentication cookies
  const token = request.cookies.get('keycloak-token')
  const idToken = request.cookies.get('keycloak-id-token')
  const refreshToken = request.cookies.get('keycloak-refresh-token')

  // If no auth cookies or only partial cookies (logout in progress), redirect to login
  if (!token || !idToken) {
    const locale = pathname.split('/')[1] || defaultLocale
    const redirectUrl = new URL(`/${locale}/auth/signin`, request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    
    // Clear any remaining auth cookies if partial state
    if (token || idToken || refreshToken) {
      const res = NextResponse.redirect(redirectUrl)
      res.cookies.delete('keycloak-token')
      res.cookies.delete('keycloak-id-token')
      res.cookies.delete('keycloak-refresh-token')
      return res
    }
    
    return NextResponse.redirect(redirectUrl)
  }

  // TODO: Add role-based access control
  // This would require decoding the JWT token and checking roles
  // For now, we'll just check if the user is authenticated

  return response
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    '/((?!_next/static|_next/image|favicon.ico|silent-check-sso.html).*)',
  ]
}