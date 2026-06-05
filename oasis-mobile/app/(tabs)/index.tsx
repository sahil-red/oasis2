import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { PromptChips } from "@/components/PromptChips";
import { ScoutSearchBar } from "@/components/ScoutSearchBar";
import { Screen } from "@/components/Screen";
import { fetchLanding } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, radius, spacing, typography } from "@/theme";
import type { LandingInsights } from "@/types/api";

export default function HomeTab() {
  const router = useRouter();
  const { profile } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [landing, setLanding] = useState<LandingInsights | null>(null);
  const [loadingLanding, setLoadingLanding] = useState(true);

  useEffect(() => {
    fetchLanding()
      .then(setLanding)
      .catch(() => setLanding(null))
      .finally(() => setLoadingLanding(false));
  }, []);

  const runSearch = useCallback(() => {
    const q = prompt.trim();
    if (q.length < 2) return;
    router.push({ pathname: "/search", params: { q } });
  }, [prompt, router]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Ask Scout</Text>
        <Text style={styles.hero}>
          We read the back label{" "}
          <Text style={styles.heroAccent}>so you don't have to</Text>.
        </Text>

        <ScoutSearchBar value={prompt} onChangeText={setPrompt} onSubmit={runSearch} />
        <PromptChips
          onSelect={(p) => {
            setPrompt(p);
            router.push({ pathname: "/search", params: { q: p } });
          }}
        />

        {profile ? (
          <Text style={styles.quota}>
            {profile.plan === "plus"
              ? "Scout Plus · unlimited AI search"
              : `${profile.ai_searches_remaining} AI searches left today`}
          </Text>
        ) : null}

        {loadingLanding ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : null}

        {landing?.pickOfDay ? (
          <Pressable
            style={styles.pickCard}
            onPress={() => router.push(`/product/${landing.pickOfDay!.pick.slug}`)}
          >
            <Text style={styles.sectionLabel}>Scout's pick today</Text>
            <View style={styles.pickRow}>
              {landing.pickOfDay.pick.image ? (
                <Image
                  source={{ uri: landing.pickOfDay.pick.image }}
                  style={styles.pickImage}
                  contentFit="contain"
                />
              ) : null}
              <View style={styles.pickBody}>
                <Text style={styles.pickName} numberOfLines={2}>
                  {landing.pickOfDay.pick.name}
                </Text>
                {landing.pickOfDay.reasons[0] ? (
                  <Text style={styles.pickReason}>{landing.pickOfDay.reasons[0]}</Text>
                ) : null}
                {landing.pickOfDay.pick.score != null ? (
                  <Text style={styles.pickScore}>Score {landing.pickOfDay.pick.score}</Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        ) : null}

        {landing?.facts?.slice(0, 3).map((fact) => (
          <View key={fact.headline} style={styles.factCard}>
            <Text style={styles.factStat}>{fact.stat}</Text>
            <Text style={styles.factHeadline}>{fact.headline}</Text>
          </View>
        ))}

        {landing ? (
          <Text style={styles.stats}>
            {landing.totalScored.toLocaleString()} products scored · avg {Math.round(landing.avgScore)}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  kicker: { ...typography.micro, color: colors.fgDim, textTransform: "uppercase" },
  hero: { ...typography.hero, color: colors.fg, marginTop: spacing.sm, marginBottom: spacing.lg },
  heroAccent: { color: colors.accent, fontStyle: "italic" },
  quota: { color: colors.fgMuted, fontSize: 13, marginTop: spacing.sm },
  sectionLabel: { ...typography.micro, color: colors.fgDim, marginBottom: spacing.sm },
  pickCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  pickRow: { flexDirection: "row", gap: spacing.md },
  pickImage: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.bgSoft },
  pickBody: { flex: 1, justifyContent: "center" },
  pickName: { ...typography.title, fontSize: 17, color: colors.fg },
  pickReason: { color: colors.fgMuted, fontSize: 13, marginTop: 4 },
  pickScore: { color: colors.accent, fontWeight: "600", marginTop: 6 },
  factCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  factStat: { fontSize: 22, fontWeight: "700", color: colors.fg },
  factHeadline: { color: colors.fgMuted, marginTop: 4, fontSize: 14 },
  stats: { color: colors.fgDim, fontSize: 12, marginTop: spacing.lg, textAlign: "center" },
});
