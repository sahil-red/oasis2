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
  LandingStatsStrip,
} from "@/components/landing/LandingSections";
import { PromptChips } from "@/components/PromptChips";
import { ScoutSearchBar } from "@/components/ScoutSearchBar";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchLanding } from "@/lib/api";
import { colors, fonts, spacing, typography } from "@/theme";
import type { LandingInsights } from "@/types/api";

export default function HomeTab() {
  const router = useRouter();
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
        showsVerticalScrollIndicator={false}
      >
        <SiteHeader />

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>Ask Scout</Text>
          <Text style={styles.heroText}>
            We read the back label{"\n"}
            <Text style={styles.heroAccent}>so you don&apos;t have to</Text>.
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchBlock}>
          <ScoutSearchBar value={prompt} onChangeText={setPrompt} onSubmit={runSearch} />
        </View>
        <PromptChips
          style={styles.chipsBlock}
          onSelect={(p) => {
            setPrompt(p);
            router.push({ pathname: "/search", params: { q: p } });
          }}
        />

        {/* Landing sections */}
        {loadingLanding && !landing ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : null}

        {landing ? (
          <>
            <LandingStatsStrip totalScored={landing.totalScored} avgScore={landing.avgScore} />
            {landing.facts?.length > 0 && <LandingFacts facts={landing.facts} />}
            {landing.goalBoards?.length > 0 && <LandingGoalBoards boards={landing.goalBoards} />}
            {landing.bestInClass?.length > 0 && <LandingBestInClass categories={landing.bestInClass} />}
            {landing.dodgeList?.length > 0 && <LandingDodgeList items={landing.dodgeList} />}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl * 2 },
  hero: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  kicker: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: colors.fgDim,
    marginBottom: spacing.sm,
  },
  heroText: {
    ...typography.hero,
    color: colors.fg,
    marginBottom: spacing.lg,
  },
  heroAccent: {
    ...typography.heroAccent,
    color: colors.accent,
  },
  searchBlock: { paddingHorizontal: spacing.lg },
  chipsBlock: { paddingHorizontal: spacing.lg },
});
