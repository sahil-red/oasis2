"use client";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { ProductCard } from "@/components/ProductCard";
import { PromptChips } from "@/components/PromptChips";
import { ScoutSearchBar } from "@/components/ScoutSearchBar";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { Panel } from "@/components/ui/Panel";
import { fetchAiSearch, fetchLanding } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { colors, fonts, radius, spacing, typography } from "@/theme";
import type { AiSearchResult, CatalogProduct, LandingInsights } from "@/types/api";

export default function HomeTab() {
  const router = useRouter();
  const token = useAccessToken();

  // Landing data
  const [landing, setLanding] = useState<LandingInsights | null>(null);
  const [loadingLanding, setLoadingLanding] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search state — kept so back-from-PDP restores it
  const [prompt, setPrompt] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<AiSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);


  const loadLanding = useCallback(async () => {
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
    loadLanding().finally(() => setLoadingLanding(false));
  }, [loadLanding]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLanding();
    setRefreshing(false);
  }, [loadLanding]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const data = await fetchAiSearch(trimmed, token, 24);
      setSearchResult(data);
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      if (err.code === "quota_exceeded" || err.status === 402) {
        setSearchError("Daily AI limit reached. Upgrade to Scout Plus for unlimited searches.");
      } else {
        setSearchError(err.message ?? "Search failed — try again.");
      }
    } finally {
      setSearching(false);
    }
  }, [token]);

  const clearSearch = useCallback(() => {
    setPrompt("");
    setSearchResult(null);
    setSearchError(null);
  }, []);

  const isSearchActive = searchResult !== null || searching || searchError !== null;

  // ── Search results view ──────────────────────────────────────────────────
  if (isSearchActive) {
    return (
      <Screen>
        {/* Sticky header */}
        <View style={styles.searchHeader}>
          <Pressable onPress={clearSearch} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.fg} />
          </Pressable>
          <View style={styles.searchBarWrap}>
            <ScoutSearchBar
              value={prompt}
              onChangeText={setPrompt}
              onSubmit={() => void runSearch(prompt)}
              loading={searching}
            />
          </View>
        </View>

        {searching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Reading labels and ranking matches…</Text>
          </View>
        ) : searchError ? (
          <View style={styles.center}>
            <Panel style={styles.errorBox}>
              <Text style={styles.errorText}>{searchError}</Text>
              {searchError.includes("Plus") ? (
                <Pressable
                  style={styles.upgradeBtn}
                  onPress={() => router.push("/subscribe")}
                >
                  <Text style={styles.upgradeBtnText}>Get Scout Plus</Text>
                </Pressable>
              ) : null}
            </Panel>
          </View>
        ) : searchResult ? (
          <FlatList
            data={searchResult.items}
            keyExtractor={(p: CatalogProduct) => p.id}
            numColumns={2}
            contentContainerStyle={styles.resultsGrid}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <Panel style={styles.summaryPanel}>
                  <Text style={styles.summaryText}>{searchResult.summary}</Text>
                  {searchResult.refinements?.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: spacing.sm }}
                      contentContainerStyle={{ gap: spacing.xs }}
                    >
                      {searchResult.refinements.map((r) => (
                        <Pressable
                          key={r}
                          style={styles.refineChip}
                          onPress={() => {
                            const next = `${prompt.trim()} ${r.replace(/^Add /i, "")}`.trim();
                            setPrompt(next);
                            void runSearch(next);
                          }}
                        >
                          <Text style={styles.refineText}>{r}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </Panel>
              </View>
            }
            renderItem={({ item }) => (
              <ProductCard product={item} aiReasons={item.ai_match_reasons} />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No products found for this search.</Text>
            }
          />
        ) : null}
      </Screen>
    );
  }

  // ── Landing view ─────────────────────────────────────────────────────────
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

        <View style={styles.hero}>
          <Text style={styles.kicker}>Ask Scout</Text>
          <Text style={styles.heroText}>
            We read the back label{"\n"}
            <Text style={styles.heroAccent}>so you don&apos;t have to</Text>.
          </Text>
        </View>

        <View style={styles.searchBlock}>
          <ScoutSearchBar
            value={prompt}
            onChangeText={setPrompt}
            onSubmit={() => void runSearch(prompt)}
          />
        </View>

        <PromptChips
          style={styles.chipsBlock}
          onSelect={(p) => {
            setPrompt(p);
            void runSearch(p);
          }}
        />

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
  // Landing
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
  heroText: { ...typography.hero, color: colors.fg, marginBottom: spacing.lg },
  heroAccent: { ...typography.heroAccent, color: colors.accent },
  searchBlock: { paddingHorizontal: spacing.lg },
  chipsBlock: { paddingHorizontal: spacing.lg },

  // Search results
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarWrap: { flex: 1 },
  center: { flex: 1, padding: spacing.xl, alignItems: "center", justifyContent: "center" },
  loadingText: {
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: { width: "100%" },
  errorText: { fontFamily: fonts.sans, color: colors.bad, fontSize: 15, lineHeight: 22 },
  upgradeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.fg,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  upgradeBtnText: { fontFamily: fonts.sansBold, color: colors.bg, fontSize: 15 },
  resultsGrid: { padding: spacing.sm, paddingBottom: spacing.xxl },
  summaryPanel: { margin: spacing.sm, marginBottom: 0 },
  summaryText: {
    fontFamily: fonts.sans,
    color: colors.fg,
    fontSize: 14,
    lineHeight: 20,
  },
  refineChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  refineText: { fontFamily: fonts.sansMedium, color: colors.fg, fontSize: 12 },
  emptyText: {
    fontFamily: fonts.sans,
    color: colors.fgDim,
    textAlign: "center",
    padding: spacing.xl,
    fontSize: 15,
  },
});
