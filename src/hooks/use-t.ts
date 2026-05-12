import { useMemo } from 'react'
import { STRINGS, type StringKey } from '@/lib/strings'
import { usePrefsStore } from '@/stores/prefs-store'

export function useT() {
  const locale = usePrefsStore((s) => s.locale)
  return useMemo(
    () => (key: StringKey, vars?: Record<string, string | number>) => {
      const tpl = (STRINGS[locale] as Record<string, string>)[key]
        ?? (STRINGS.en as Record<string, string>)[key]
        ?? key
      if (!vars) return tpl
      return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
    },
    [locale],
  )
}
