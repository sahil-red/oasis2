"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/auth/profile";

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: UserProfile | null;
  signInWithGoogle: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(accessToken: string): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/me", {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile: UserProfile };
    return data.profile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // supabaseClient may be null if env vars aren't configured — degrade gracefully
    if (!supabaseClient) {
      setReady(true);
      return;
    }
    const supabase = supabaseClient;

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const p = await fetchProfile(data.session.access_token);
        setProfile(p);
      }
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession) {
        const p = await fetchProfile(newSession.access_token);
        setProfile(p);
      } else {
        setProfile(null);
      }
      if (!ready) setReady(true);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseClient) throw new Error("Supabase not configured");
    const supabase = supabaseClient;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const signInWithPhone = useCallback(async (phone: string) => {
    if (!supabaseClient) throw new Error("Supabase not configured");
    const supabase = supabaseClient;
    const normalised = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: normalised });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    if (!supabaseClient) throw new Error("Supabase not configured");
    const supabase = supabaseClient;
    const normalised = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;
    const { error } = await supabase.auth.verifyOtp({ phone: normalised, token, type: "sms" });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const p = await fetchProfile(session.access_token);
    setProfile(p);
  }, [session]);

  const value = useMemo<AuthState>(() => ({
    ready, session, profile,
    signInWithGoogle, signInWithPhone, verifyOtp, signOut, refreshProfile,
  }), [ready, session, profile, signInWithGoogle, signInWithPhone, verifyOtp, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
