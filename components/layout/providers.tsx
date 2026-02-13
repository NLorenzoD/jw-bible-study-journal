'use client';

import { useEffect } from 'react';

import { AuthProvider } from '@/lib/hooks/useAuth';
import { HouseholdProvider } from '@/lib/hooks/useHousehold';
import { useReminderEngine } from '@/lib/hooks/useReminderEngine';
import { ThemeProvider } from '@/lib/hooks/useTheme';

function ReminderEngineMount() {
  useReminderEngine();
  return null;
}

function DevLocalhostCleanup() {
  useEffect(() => {
    const host = window.location.hostname;
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalhost) {
      return;
    }
    if (sessionStorage.getItem('localhost-cache-cleaned') === '1') {
      return;
    }
    sessionStorage.setItem('localhost-cache-cleaned', '1');

    const clearDevCaches = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {
        // Ignore cleanup errors in dev.
      }
    };

    void clearDevCaches();
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HouseholdProvider>
          <DevLocalhostCleanup />
          <ReminderEngineMount />
          {children}
        </HouseholdProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
