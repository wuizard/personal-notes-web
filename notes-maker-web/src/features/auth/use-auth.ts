"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured, type AuthUser } from "./firebase";

export interface AuthState {
  user: AuthUser | null;
  /** True until Firebase has restored (or denied) the persisted session. */
  loading: boolean;
}

/**
 * Live auth state. Loads firebase lazily on mount, so the shell renders and
 * hydrates before any auth code is even fetched. When Firebase is not
 * configured this settles immediately to signed-out and never loads the SDK.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: isFirebaseConfigured(),
  });

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    let cancelled = false;
    let unsubscribe = () => {};

    void (async () => {
      try {
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import("firebase/auth");
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(auth, (u) => {
          setState({
            user: u
              ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL }
              : null,
            loading: false,
          });
        });
      } catch {
        if (!cancelled) setState({ user: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
