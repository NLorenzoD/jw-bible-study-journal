'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useHousehold } from '@/lib/hooks/useHousehold';

const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000010';

export function useUserContext() {
  const { user, loading: authLoading } = useAuth();
  const { householdId, role, loading: householdLoading } = useHousehold();

  return {
    userId: user?.uid ?? LOCAL_USER_ID,
    householdId,
    role,
    loading: authLoading || householdLoading,
    isAuthenticated: Boolean(user)
  };
}
