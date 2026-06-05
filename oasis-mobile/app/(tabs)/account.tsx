import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { Panel } from "@/components/ui/Panel";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, spacing } from "@/theme";

export default function AccountTab() {
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SiteHeader />
        <Eyebrow style={styles.eyebrow}>Your account</Eyebrow>
        <SectionTitle style={styles.title}>Settings</SectionTitle>

        <Panel style={styles.card}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>
            {profile?.plan === "plus" ? "Scout Plus" : "Free"}
          </Text>
          {profile?.plan !== "plus" ? (
            <Text style={styles.hint}>
              {profile?.ai_searches_remaining ?? 0} of {profile?.ai_searches_limit ?? 5} AI searches
              today
            </Text>
          ) : (
            <Text style={styles.hint}>Unlimited AI search · ₹199/mo</Text>
          )}
        </Panel>

        {profile?.email ? (
          <Panel style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{profile.email}</Text>
          </Panel>
        ) : null}
        {profile?.phone ? (
          <Panel style={styles.card}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{profile.phone}</Text>
          </Panel>
        ) : null}

        {profile?.plan !== "plus" ? (
          <Pressable style={styles.primary} onPress={() => router.push("/subscribe")}>
            <Ionicons name="card" size={20} color={colors.bg} />
            <Text style={styles.primaryText}>Upgrade · UPI or card</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.row} onPress={() => void refreshProfile()}>
          <Text style={styles.rowText}>Refresh status</Text>
          <Ionicons name="refresh" size={18} color={colors.fgMuted} />
        </Pressable>

        <Pressable style={styles.row} onPress={() => void signOut()}>
          <Text style={[styles.rowText, { color: colors.bad }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  eyebrow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  title: { fontSize: 26, paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: spacing.md },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  label: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1, color: colors.fgDim, textTransform: "uppercase" },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 18, color: colors.fg, marginTop: 4 },
  hint: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 13, marginTop: 6 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.fg,
    borderRadius: radius.xl,
    paddingVertical: 16,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  primaryText: { fontFamily: fonts.sansBold, color: colors.bg, fontSize: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowText: { fontFamily: fonts.sans, color: colors.fg, fontSize: 16 },
});
