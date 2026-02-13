'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { BottomNav } from '@/components/layout/bottom-nav';
import { Button } from '@/components/shared/button';
import { useAuth } from '@/lib/hooks/useAuth';
import { useSyncEngine } from '@/lib/hooks/useSyncEngine';
import { useTheme } from '@/lib/hooks/useTheme';

const TITLES: Record<string, string> = {
  '/today': 'Today',
  '/progress': 'Progress',
  '/projects': 'Projects',
  '/highlights': 'Highlights',
  '/settings': 'Settings'
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { canAuth, loading, user, signInWithGoogle, signInWithApple, signOut } = useAuth();
  const { lastSyncMessage } = useSyncEngine();

  return (
    <div className="mx-auto min-h-screen max-w-screen-sm px-4 pb-24 pt-5">
      <header className="mb-5 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-3xl leading-none text-ink">{TITLES[pathname] ?? 'Bible Journal'}</p>
            <p className="text-xs text-muted">{lastSyncMessage}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-full p-2">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {canAuth ? (
          <div className="flex items-center justify-between rounded-xl border border-muted/20 bg-surface px-3 py-2 text-xs">
            {loading ? (
              <span className="text-muted">Checking sign-in status...</span>
            ) : user ? (
              <>
                <span className="text-muted">Signed in as {user.email ?? user.displayName ?? 'your account'}</span>
                <Button variant="secondary" className="px-3 py-1" onClick={signOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <span className="text-muted">Sign in to sync across devices</span>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={signInWithGoogle}>
                    Google
                  </Button>
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={signInWithApple}>
                    Apple
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted">
            Firebase config is missing. Running in offline-only mode.
          </div>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="space-y-4"
        >
          {children}
        </motion.main>
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
