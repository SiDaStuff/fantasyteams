/**
 * Auth context + hook, intentionally co-located (context files export both a
 * provider and its consumer hook by design).
 */
/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { api, apiErrorMessage } from '@/lib/api';
import { toErrorMessage } from '@/lib/errors';
import type { UserProfile } from '@/types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unconfigured';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<User>;
  signOutUser: () => Promise<void>;
  /** Syncs display name / photo with both the Auth record and the API. */
  updateOwnProfile: (patch: { displayName?: string; photoURL?: string | null }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isFirebaseConfigured() ? 'loading' : 'unconfigured',
  );
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    // When Firebase is unconfigured the initial state is already 'unconfigured'.
    if (!auth) return undefined;

    let disposed = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (disposed) return;
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setStatus('unauthenticated');
        return;
      }

      setStatus('authenticated');

      // The server creates a profile from verified ID-token claims when the
      // user is brand new, so this call is idempotent.
      try {
        const fetched = await api.getMe();
        if (disposed || getFirebaseAuth()?.currentUser?.uid !== firebaseUser.uid) return;
        setProfile(fetched);
      } catch {
        if (!disposed) setProfile(null);
      }
    });

    return () => {
      disposed = true;
      unsubscribeAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase is not configured.');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase is not configured.');
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    return result.user;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase is not configured.');
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const currentUser = result.user;
    if (currentUser.displayName !== displayName) {
      await updateProfile(currentUser, { displayName: displayName.trim() });
    }
    // Force a fresh ID token so the name claim reaches the server immediately.
    await currentUser.getIdToken(true);
    return currentUser;
  }, []);

  const signOutUser = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
    setProfile(null);
  }, []);

  const updateOwnProfile = useCallback(
    async (patch: { displayName?: string; photoURL?: string | null }) => {
      const refreshed = await api.updateProfile(patch);
      setProfile(refreshed);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOutUser,
      updateOwnProfile,
    }),
    [status, user, profile, signInWithGoogle, signInWithEmail, signUpWithEmail, signOutUser, updateOwnProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}

/** Strips auth connection errors down to a readable message. */
export function authErrorMessage(error: unknown): string {
  const message = toErrorMessage(error);
  if (message.includes('auth/')) {
    switch (message.match(/auth\/([a-z-]+)/)?.[1]) {
      case 'invalid-credential':
      case 'wrong-password':
      case 'user-not-found':
      case 'invalid-login-credentials':
        return 'Incorrect email or password.';
      case 'user-disabled':
        return 'This account has been disabled.';
      case 'email-already-in-use':
        return 'An account with this email already exists. Try signing in.';
      case 'weak-password':
        return 'That password is too weak.';
      case 'operation-not-allowed':
      case 'popup-blocked':
        return 'The sign-in option is not enabled for this project or was blocked.';
      case 'network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'unauthorized-domain':
        return 'This domain is not authorized for Firebase Authentication.';
      default:
        return message.replace(/^.*auth\/[a-z-]+\)?:\s*/, '');
    }
  }
  return apiErrorMessage(error);
}