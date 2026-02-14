'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/lib/hooks/useAuth';
import { getFirebaseDb, getFirebaseFunctions } from '@/lib/firebase/client';
import { Role } from '@/lib/types';

interface HouseholdState {
  householdId: string;
  role: Role;
  loading: boolean;
  createInvite: () => Promise<string | null>;
  acceptInvite: (token: string) => Promise<boolean>;
}

const FALLBACK_USER_ID = '00000000-0000-0000-0000-000000000010';
const FALLBACK_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000100';
const DEFAULT_INVITE_ORIGIN = 'https://jw-bible-study-journal.firebaseapp.com';

function getInviteOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.origin;
    }
  }
  return DEFAULT_INVITE_ORIGIN;
}

const HouseholdContext = createContext<HouseholdState | undefined>(undefined);

async function findMembership(userId: string) {
  const firestore = getFirebaseDb();
  if (!firestore) {
    return null;
  }

  const snapshot = await getDocs(
    query(collection(firestore, 'householdMembers'), where('user_id', '==', userId), limit(1))
  );

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as { household_id: string; role: Role };
}

async function bootstrapHouseholdClientSide(userId: string, email?: string | null) {
  const firestore = getFirebaseDb();
  if (!firestore) {
    return null;
  }

  const householdId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  const timestamp = new Date().toISOString();
  const profileRef = doc(firestore, 'profiles', userId);
  const existingProfile = await getDoc(profileRef);

  await setDoc(
    profileRef,
    {
      id: userId,
      email: email ?? null,
      ...(existingProfile.exists()
        ? {}
        : {
            pricing_plan: 'free',
            is_beta_tester: false
          }),
      updated_at: timestamp
    },
    { merge: true }
  );

  await setDoc(doc(firestore, 'households', householdId), {
    id: householdId,
    name: 'Household',
    created_by: userId,
    created_at: timestamp,
    updated_at: timestamp
  });

  await setDoc(doc(firestore, 'householdMembers', `${householdId}_${userId}`), {
    id: `${householdId}_${userId}`,
    household_id: householdId,
    user_id: userId,
    role: 'owner',
    joined_at: timestamp
  });

  return householdId;
}

async function ensureProfileDefaultsClient(userId: string, email?: string | null) {
  const firestore = getFirebaseDb();
  if (!firestore) {
    return;
  }

  const profileRef = doc(firestore, 'profiles', userId);
  const snapshot = await getDoc(profileRef);
  const profile = snapshot.data() as Record<string, unknown> | undefined;
  const timestamp = new Date().toISOString();

  await setDoc(
    profileRef,
    {
      id: userId,
      email: email ?? (typeof profile?.email === 'string' ? profile.email : null),
      ...(!snapshot.exists() || !('pricing_plan' in (profile ?? {})) ? { pricing_plan: 'free' } : {}),
      ...(!snapshot.exists() || !('is_beta_tester' in (profile ?? {})) ? { is_beta_tester: false } : {}),
      updated_at: timestamp
    },
    { merge: true }
  );
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const firestore = getFirebaseDb();
  const functions = getFirebaseFunctions();

  const [householdId, setHouseholdId] = useState(FALLBACK_HOUSEHOLD_ID);
  const [role, setRole] = useState<Role>('owner');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolveHousehold() {
      if (!user || !firestore) {
        setHouseholdId(FALLBACK_HOUSEHOLD_ID);
        setRole('owner');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        try {
          await ensureProfileDefaultsClient(user.uid, user.email);
        } catch {
          // Do not block household resolution if profile defaulting fails temporarily.
        }

        const member = await findMembership(user.uid);
        if (member?.household_id) {
          if (active) {
            setHouseholdId(member.household_id);
            setRole(member.role ?? 'member');
          }
          return;
        }

        if (functions) {
          const bootstrap = httpsCallable(functions, 'bootstrapHousehold');
          await bootstrap();
        } else {
          await bootstrapHouseholdClientSide(user.uid, user.email);
        }

        const nextMember = await findMembership(user.uid);
        if (active && nextMember?.household_id) {
          setHouseholdId(nextMember.household_id);
          setRole(nextMember.role ?? 'owner');
        }
      } catch {
        if (active) {
          setHouseholdId(FALLBACK_HOUSEHOLD_ID);
          setRole('owner');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    resolveHousehold();

    return () => {
      active = false;
    };
  }, [firestore, functions, user]);

  const value = useMemo<HouseholdState>(
    () => ({
      householdId,
      role,
      loading,
      createInvite: async () => {
        if (!firestore || !user || role !== 'owner') {
          return null;
        }

        try {
          const token = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
          const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

          await setDoc(doc(firestore, 'householdInvites', token), {
            id: token,
            token,
            household_id: householdId,
            created_by: user.uid,
            created_at: new Date().toISOString(),
            expires_at: expiresAt,
            used_at: null
          });

          return `${getInviteOrigin()}/settings?invite=${token}`;
        } catch {
          return null;
        }
      },
      acceptInvite: async (token: string) => {
        if (!functions) {
          return false;
        }

        try {
          const accept = httpsCallable<{ token: string }, { householdId: string }>(functions, 'acceptHouseholdInvite');
          await accept({ token });

          const nextMember = await findMembership(user?.uid ?? FALLBACK_USER_ID);
          if (nextMember?.household_id) {
            setHouseholdId(nextMember.household_id);
            setRole(nextMember.role ?? 'member');
          }

          return true;
        } catch {
          return false;
        }
      }
    }),
    [firestore, functions, householdId, loading, role, user]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold must be used in HouseholdProvider');
  }
  return context;
}
