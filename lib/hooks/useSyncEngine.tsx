'use client';

import { useEffect, useState } from 'react';

import { getFirebaseDb } from '@/lib/firebase/client';
import { flushSyncQueue, pullServerData } from '@/lib/firebase/sync';
import { useAuth } from '@/lib/hooks/useAuth';
import { useHousehold } from '@/lib/hooks/useHousehold';

export function useSyncEngine() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [lastSyncMessage, setLastSyncMessage] = useState('Waiting for changes');

  useEffect(() => {
    const firestore = getFirebaseDb();

    if (!firestore || !user) {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      if (!navigator.onLine || cancelled) {
        return;
      }

      try {
        await pullServerData(firestore, user.uid, householdId);
        const result = await flushSyncQueue(firestore);
        if (cancelled) {
          return;
        }

        if (!result.synced && !result.failed) {
          setLastSyncMessage('All changes synced');
          return;
        }

        setLastSyncMessage(
          result.failed
            ? `Synced ${result.synced} updates, ${result.failed} failed`
            : `Synced ${result.synced} updates`
        );
      } catch (error) {
        if (!cancelled) {
          setLastSyncMessage(error instanceof Error ? `Sync error: ${error.message}` : 'Sync error');
        }
      }
    };

    sync();

    const interval = window.setInterval(sync, 25_000);
    window.addEventListener('online', sync);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
    };
  }, [householdId, user]);

  return {
    lastSyncMessage
  };
}
