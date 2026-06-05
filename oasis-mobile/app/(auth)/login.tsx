import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/auth";
import { colors, radius, spacing, typography } from "@/theme";

export default function LoginScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function wrap(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Sign in failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!supabaseConfigured) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.title}>Scout</Text>
        <Text style={styles.hint}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.primaryBtnText}>Continue without auth (dev)</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Honest grocery intel · India</Text>
          <Text style={styles.title}>Scout</Text>
          <Text style={styles.subtitle}>
            Sign in to save your basket, unlock Ask Scout AI, and subscribe with UPI or card.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.oauthBtn}
            disabled={busy}
            onPress={() => wrap(() => auth.signInWithGoogle())}
          >
            <Ionicons name="logo-google" size={20} color={colors.fg} />
            <Text style={styles.oauthText}>Continue with Google</Text>
          </Pressable>

          {Platform.OS === "ios" ? (
            <Pressable
              style={styles.oauthBtn}
              disabled={busy}
              onPress={() => wrap(() => auth.signInWithApple())}
            >
              <Ionicons name="logo-apple" size={22} color={colors.fg} />
              <Text style={styles.oauthText}>Continue with Apple</Text>
            </Pressable>
          ) : null}

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or phone</Text>
            <View style={styles.line} />
          </View>

          <TextInput
            style={styles.input}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.fgDim}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            editable={!busy}
          />

          {otpSent ? (
            <TextInput
              style={styles.input}
              placeholder="6-digit OTP"
              placeholderTextColor={colors.fgDim}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              editable={!busy}
            />
          ) : null}

          <Pressable
            style={styles.primaryBtn}
            disabled={busy || phone.replace(/\D/g, "").length < 10}
            onPress={() => {
              if (!otpSent) {
                setBusy(true);
                auth
                  .sendPhoneOtp(phone)
                  .then(() => setOtpSent(true))
                  .catch((e: unknown) =>
                    Alert.alert("OTP failed", e instanceof Error ? e.message : "Failed"),
                  )
                  .finally(() => setBusy(false));
              } else {
                void wrap(() => auth.verifyPhoneOtp(phone, otp));
              }
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>{otpSent ? "Verify OTP" : "Send OTP"}</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.legal}>
          By continuing you agree to our Terms and Privacy Policy. Not medical advice.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, padding: spacing.lg },
  centered: { justifyContent: "center", alignItems: "center", padding: spacing.lg },
  hero: { marginTop: spacing.xl, marginBottom: spacing.xl },
  kicker: { ...typography.micro, color: colors.fgDim, textTransform: "uppercase" },
  title: { ...typography.hero, color: colors.fg, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.fgMuted, marginTop: spacing.md },
  actions: { gap: spacing.md },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
  },
  oauthText: { color: colors.fg, fontSize: 16, fontWeight: "600" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.sm },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.fgDim, fontSize: 12 },
  input: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.fg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.bg, fontSize: 16, fontWeight: "700" },
  hint: { color: colors.fgMuted, textAlign: "center", marginVertical: spacing.lg },
  legal: { color: colors.fgDim, fontSize: 11, textAlign: "center", marginTop: "auto", paddingBottom: spacing.lg },
});
