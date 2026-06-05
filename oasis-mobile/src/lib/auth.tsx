import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { fetchMe } from "@/lib/api";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { UserProfile } from "@/types/api";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  ready: boolean;
  session: { access_token: string } | null;
  profile: UserProfile | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token) {
      setProfile(null);
      return;
    }
    try {
      const me = await fetchMe(session.access_token);
      setProfile(me.profile);
    } catch {
      setProfile(null);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      setSession(token ? { access_token: token } : null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s?.access_token ? { access_token: s.access_token } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error("Supabase not configured");
    const redirectTo = Linking.createURL("/");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error("No OAuth URL");
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success" && result.url) {
      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!supabase) throw new Error("Supabase not configured");
    if (Platform.OS !== "ios") throw new Error("Apple Sign In is iOS only");
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error("No Apple identity token");
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw error;
  }, []);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const normalized = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    if (error) throw error;
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const normalized = phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token,
      type: "sms",
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      profile,
      signInWithGoogle,
      signInWithApple,
      sendPhoneOtp,
      verifyPhoneOtp,
      signOut,
      refreshProfile,
    }),
    [
      ready,
      session,
      profile,
      signInWithGoogle,
      signInWithApple,
      sendPhoneOtp,
      verifyPhoneOtp,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAccessToken(): string | null {
  return useAuth().session?.access_token ?? null;
}

export { supabaseConfigured };
