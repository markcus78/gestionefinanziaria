'use client'

import { useEffect } from 'react'
import { logSessionRestored } from '@/app/(protected)/audit/actions'

export function SessionTracker() {
  useEffect(() => {
    logSessionRestored()
  }, [])
  return null
}
