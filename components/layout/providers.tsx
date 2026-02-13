'use client';

import { AuthProvider } from '@/lib/hooks/useAuth';
import { HouseholdProvider } from '@/lib/hooks/useHousehold';
import { useReminderEngine } from '@/lib/hooks/useReminderEngine';
import { ThemeProvider } from '@/lib/hooks/useTheme';

function ReminderEngineMount() {
  useReminderEngine();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HouseholdProvider>
          <ReminderEngineMount />
          {children}
        </HouseholdProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
