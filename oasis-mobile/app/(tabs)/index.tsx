import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  LandingBestInClass,
  LandingDodgeList,
  LandingFacts,
  LandingGoalBoards,
  LandingPickCard,
  LandingStatsStrip,
} from "@/components/landing/LandingSections";
import { PromptChips } from "@/components/PromptChips";
import { ScoutSearchBar } from "@/components/ScoutSearchBar";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { Eyebrow } from "@/components/ui/Typography";
import { fetchLanding } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, fonts, spacing, typography } from "@/theme";
import type { LandingInsights } from "@/types/api";

export default function HomeTab() {
  const router = useRouter();
  const { profile } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [landing, setLanding] = useState<LandingInsights | null>(null);
  const [loadingLanding, setLoadingLanding] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchLanding();
      setLanding({
        ...data,
        goalBoards: data.goalBoards ?? [],
        bestInClass: data.bestInClass ?? [],
        dodgeList: data.dodgeList ?? [],
      });
    } catch {
      setLanding(null);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoadingLanding(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const runSearch = useCallback(() => {
    const q = prompt.trim();
    if (q.length < 2) return;
    router.push({ pathname: "/search", params: { q } });
  }, [prompt, router]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <SiteHeader />

        <Eyebrow style={styles.kicker}>Ask Scout</Eyebrow>
        <Text style={styles.hero}>
          We read the back label{" "}
          <Text style={styles.heroAccent}>so you don&apos;t have to</Text>.
        </Text>

        <View style={styles.searchBlock}>
          <ScoutSearchBar value={prompt} onChangeText={setPrompt} onSubmit={runSearch} />
        </View>
        <View style={styles.chipsBlock}>
        <PromptChips
          onSelect={(p) => {
            setPrompt(p);
            router.push({ pathname: "/search", params: { q: p } });
          }}
        />
        </View>

        {profile ? (
          <Text style={styles.quota}>
            {profile.plan === "plus"
              ? "Scout Plus · unlimited AI search"
              : `${profile.ai_searches_remaining} AI searches left today`}
          </Text>
        ) : null}

        {loadingLanding ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : null}

        {landing?.pickOfDay ? <LandingPickCard landing={landing.pickOfDay} /> : null}

        {landing ? (
          <LandingStatsStrip totalScored={landing.totalScored} avgScore={landing.avgScore} />
        ) : null}

        {landing?.facts?.length ? <LandingFacts facts={landing.facts} /> : null}
        {landing?.goalBoards?.length ? <LandingGoalBoards boards={landing.goalBoards} /> : null}
        {landing?.bestInClass?.length ? (
          <LandingBestInClass categories={landing.bestInClass} />
        ) : null}
        {landing?.dodgeList?.length ? <LandingDodgeList items={landing.dodgeList} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl * 2 },
  kicker: { marginTop: spacing.md, paddingHorizontal: spacing.lg },
  hero: {
    ...typography.hero,
    color: colors.fg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  heroAccent: { ...typography.heroAccent, color: colors.accent },
  searchBlock: { paddingHorizontal: spacing.lg },
  chipsBlock: { paddingHorizontal: spacing.lg },
  quota: {
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
