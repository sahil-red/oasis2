import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { colors, radius, spacing, typography } from "@/theme";

export default function AccountTab() {
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>
            {profile?.plan === "plus" ? "Scout Plus" : "Free"}
          </Text>
          {profile?.plan !== "plus" ? (
            <Text style={styles.hint}>
              {profile?.ai_searches_remaining ?? 0} of {profile?.ai_searches_limit ?? 5} AI searches
              today
            </Text>
          ) : null}
        </View>

        {profile?.email ? (
          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{profile.email}</Text>
          </View>
        ) : null}
        {profile?.phone ? (
          <View style={styles.card}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{profile.phone}</Text>
          </View>
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg },
  title: { ...typography.title, color: colors.fg, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  label: { ...typography.micro, color: colors.fgDim },
  value: { fontSize: 18, fontWeight: "600", color: colors.fg, marginTop: 4 },
  hint: { color: colors.fgMuted, fontSize: 13, marginTop: 6 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginBottom: spacing.lg,
  },
  primaryText: { color: colors.bg, fontSize: 16, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowText: { color: colors.fg, fontSize: 16 },
});
