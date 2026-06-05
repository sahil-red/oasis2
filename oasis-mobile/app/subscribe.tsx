import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { createSubscription } from "@/lib/api";
import { useAccessToken, useAuth } from "@/lib/auth";
import { colors, radius, spacing, typography } from "@/theme";

const FEATURES = [
  "Unlimited Ask Scout AI search",
  "Full ingredient intelligence on every product",
  "Priority access to new label data",
  "No ads — ever",
];

export default function SubscribeScreen() {
  const router = useRouter();
  const token = useAccessToken();
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function subscribe() {
    if (!token) {
      Alert.alert("Sign in required", "Please sign in to subscribe.");
      router.replace("/(auth)/login");
      return;
    }
    setBusy(true);
    try {
      const checkout = await createSubscription(token);
      if (checkout.checkout_url) {
        await WebBrowser.openBrowserAsync(checkout.checkout_url);
        Alert.alert(
          "Complete payment",
          "Finish UPI or card mandate on Razorpay, then tap Refresh on Account.",
        );
      } else {
        Alert.alert(
          "Subscription created",
          `ID: ${checkout.subscription_id}. Complete authentication in Razorpay dashboard if needed.`,
        );
      }
      await refreshProfile();
    } catch (e) {
      Alert.alert("Could not start checkout", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.fg} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>Scout Plus</Text>
        <Text style={styles.title}>Honest grocery intel, unlimited</Text>
        <Text style={styles.price}>₹199<Text style={styles.per}>/month</Text></Text>
        <Text style={styles.payMethods}>Pay with UPI AutoPay or card mandate · Cancel anytime</Text>

        {FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <Ionicons name="checkmark-circle" size={20} color={colors.good} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}

        <Pressable style={styles.cta} onPress={() => void subscribe()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.ctaText}>Subscribe with Razorpay</Text>
          )}
        </Pressable>

        <Text style={styles.legal}>
          Recurring billing via Razorpay. GST as applicable. By subscribing you agree to our
          Terms. Scout is not medical advice.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  kicker: { ...typography.micro, color: colors.accent },
  title: { ...typography.hero, fontSize: 28, color: colors.fg, marginTop: spacing.sm },
  price: { fontSize: 40, fontWeight: "800", color: colors.fg, marginTop: spacing.lg },
  per: { fontSize: 18, fontWeight: "500", color: colors.fgMuted },
  payMethods: { color: colors.fgMuted, marginTop: spacing.sm, fontSize: 14 },
  feature: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "center" },
  featureText: { color: colors.fg, fontSize: 16, flex: 1 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  ctaText: { color: colors.bg, fontSize: 17, fontWeight: "700" },
  legal: { color: colors.fgDim, fontSize: 11, marginTop: spacing.lg, lineHeight: 16 },
});
