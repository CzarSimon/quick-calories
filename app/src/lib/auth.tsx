import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { clearOutbox } from '@/lib/outbox';
import { authReady, pb } from '@/lib/pocketbase';
import { clearCache } from '@/lib/query-client';

type AuthState = {
  ready: boolean;
  isLoggedIn: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setIsLoggedIn(pb.authStore.isValid);
      setEmail((pb.authStore.record?.email as string | undefined) ?? null);
    };
    const unsubscribe = pb.authStore.onChange(sync);

    authReady.then(async () => {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh();
        } catch (err) {
          // Offline: keep the stored token. Rejected token: sign out.
          const status = (err as { status?: number }).status;
          if (status === 401 || status === 403) pb.authStore.clear();
        }
      }
      sync();
      setReady(true);
    });

    return unsubscribe;
  }, []);

  const value: AuthState = {
    ready,
    isLoggedIn,
    email,
    signIn: async (userEmail, password) => {
      await pb.collection('users').authWithPassword(userEmail, password);
    },
    signOut: () => {
      pb.authStore.clear();
      // The saved data and unsent changes belong to the account that just signed out.
      void clearCache();
      void clearOutbox();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
