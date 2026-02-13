'use client';

import {
  browserLocalPersistence,
  GoogleAuthProvider,
  User,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signOut as firebaseSignOut,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  canAuth: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const canAuth = isFirebaseConfigured();
  const auth = getFirebaseAuth();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !canAuth) {
      setLoading(false);
      return;
    }

    let active = true;
    let unsubscribe: () => void = () => {};

    const bootstrapAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // Persistence can fail in restricted browser contexts; continue with default behavior.
      }

      if (!active) {
        return;
      }

      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      });

      await getRedirectResult(auth).catch(() => null);
    };

    bootstrapAuth();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth, canAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      canAuth,
      signInWithGoogle: async () => {
        if (!auth) {
          return;
        }
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await signInWithPopup(auth, provider);
        } catch {
          await signInWithRedirect(auth, provider);
        }
      },
      signOut: async () => {
        if (!auth) {
          return;
        }
        await firebaseSignOut(auth);
      }
    }),
    [auth, canAuth, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
