import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AccountPreferencesProvider } from '@/components/providers/account-preferences-provider'
import { AuthSessionProvider } from '@/components/providers/auth-session-provider'
import { I18nProvider } from '@/components/providers/i18n-provider'
import { ProgressScopeProvider } from '@/components/providers/progress-scope-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb', display: 'swap' })

export const metadata: Metadata = {
  title: 'ace-aws',
  description: 'AWS certification practice',
}

const themeInitScript = `(function(){try{
  var p = localStorage.getItem('ace-aws/prefs/v1');
  var t = p ? JSON.parse(p).state.theme : 'system';
  var r = t === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t;
  if (r === 'dark') document.documentElement.setAttribute('data-theme','dark');
}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme-init inline script must run before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg text-ink antialiased min-h-dvh">
        <AuthSessionProvider>
          <QueryProvider>
            <ProgressScopeProvider>
              <AccountPreferencesProvider>
                <ThemeProvider>
                  <I18nProvider>{children}</I18nProvider>
                </ThemeProvider>
              </AccountPreferencesProvider>
            </ProgressScopeProvider>
          </QueryProvider>
        </AuthSessionProvider>
      </body>
    </html>
  )
}
