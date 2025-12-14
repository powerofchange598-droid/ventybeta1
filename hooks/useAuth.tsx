import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAuth } from '../auth/firebase';
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User as FirebaseUser,
} from 'firebase/auth';

export interface AuthContextType {
  user: FirebaseUser | null;
  signInWithGoogle: () => Promise<FirebaseUser | null>;
  signInWithFacebook: () => Promise<FirebaseUser | null>;
  signInWithApple: () => Promise<FirebaseUser | null>;
  signUpWithEmail: (email: string, password: string) => Promise<FirebaseUser | null>;
  signInWithEmail: (email: string, password: string) => Promise<FirebaseUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const getLocalUsers = () => {
    try {
      const raw = localStorage.getItem('ventyLocalUsers');
      return raw ? JSON.parse(raw) as Record<string, { password: string; displayName?: string }> : {};
    } catch {
      return {};
    }
  };
  const setLocalUsers = (u: Record<string, { password: string; displayName?: string }>) => {
    try { localStorage.setItem('ventyLocalUsers', JSON.stringify(u)); } catch {}
  };
  const makeFakeUser = (email: string, displayName?: string) => {
    return {
      uid: `local_${btoa(email).replace(/=/g, '')}`,
      email,
      displayName: displayName || '',
    } as unknown as FirebaseUser;
  };
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    const a = getAuth();
    if (!a) return;
    return onAuthStateChanged(a, (u) => setUser(u));
  }, []);
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await r.json();
        if (!canceled && data?.ok && data.user) {
          const u = makeFakeUser(data.user.email || '', data.user.name || '');
          (u as any).uid = data.user.userId || (u as any).uid;
          setUser(u);
        }
      } catch {}
    })();
    return () => { canceled = true; };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const a = getAuth();
      if (!a) return null;
      const res = await signInWithPopup(a, provider);
      const cred = GoogleAuthProvider.credentialFromResult(res);
      const idToken = cred?.idToken;
      if (!idToken) {
        setUser(null);
        return null;
      }
      const r = await fetch('/api/auth/session/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setUser(null);
        return null;
      }
      const u = makeFakeUser(data.user?.email || res.user.email || '', data.user?.name || res.user.displayName || '');
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const signInWithFacebook = async () => {
    try {
      const provider = new FacebookAuthProvider();
      const a = getAuth();
      if (!a) return null;
      const res = await signInWithPopup(a, provider);
      const cred = FacebookAuthProvider.credentialFromResult(res) as any;
      const accessToken = cred?.accessToken;
      if (!accessToken) {
        setUser(null);
        return null;
      }
      const r = await fetch('/api/auth/session/facebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accessToken }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setUser(null);
        return null;
      }
      const u = makeFakeUser(data.user?.email || res.user.email || '', data.user?.name || res.user.displayName || '');
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const signInWithApple = async () => {
    try {
      const provider = new OAuthProvider('apple.com');
      const a = getAuth();
      if (!a) return null;
      const res = await signInWithPopup(a, provider);
      const cred = OAuthProvider.credentialFromResult(res) as any;
      const idToken = cred?.idToken;
      if (!idToken) {
        setUser(null);
        return null;
      }
      const r = await fetch('/api/auth/session/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setUser(null);
        return null;
      }
      const u = makeFakeUser(data.user?.email || res.user.email || '', data.user?.name || res.user.displayName || '');
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      const r = await fetch('/api/auth/email/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) return null;
      const u = makeFakeUser(data.user?.email || email, data.user?.name || '');
      (u as any).uid = data.user?.userId || (u as any).uid;
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const r = await fetch('/api/auth/email/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) return null;
      const u = makeFakeUser(data.user?.email || email, data.user?.name || '');
      (u as any).uid = data.user?.userId || (u as any).uid;
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const signOutFn = async () => {
    const a = getAuth();
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    if (a) {
      await signOut(a);
    }
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    signInWithGoogle,
    signInWithFacebook,
    signInWithApple,
    signUpWithEmail,
    signInWithEmail,
    signOut: signOutFn,
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
