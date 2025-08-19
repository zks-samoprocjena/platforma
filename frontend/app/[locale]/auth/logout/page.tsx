'use client'

import { useEffect } from 'react'
import { performCompleteLogout } from '@/lib/logout-helper'
import { useParams } from 'next/navigation'

export default function LogoutPage() {
  const params = useParams()
  const locale = (params.locale as string) || 'hr'

  useEffect(() => {
    // Perform complete logout
    performCompleteLogout(locale)
  }, [locale])

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg"></div>
        <p className="mt-4 text-lg">Odjava u tijeku...</p>
        <p className="mt-2 text-sm text-base-content/70">
          Bit ćete preusmjereni na početnu stranicu.
        </p>
      </div>
    </div>
  )
}