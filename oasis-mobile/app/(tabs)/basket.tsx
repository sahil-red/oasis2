import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BasketCartLine } from "@/components/basket/BasketCartLine";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { Panel } from "@/components/ui/Panel";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { fetchProductsBySlugs, fetchSwaps } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import {
  GOAL_OPTIONS,
  readStoredGoal,
  writeStoredGoal,
  type GoalId,
} from "@/lib/goals";
import { useTheme } from "@/lib/theme-context";
import { catalogTierFill } from "@/lib/score";
import { fonts, radius, spacing } from "@/theme";
import type { BasketSwap, CatalogProduct } from "@/types/api";

export default function BasketTab() {
  const router = useRouter();
  const basket = useBasket();
  const { colors } = useTheme();
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [swaps, setSwaps] = useState<Record<string, BasketSwap[]>>({});
  const [loading, setLoading] = useState(false);
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [goal, setGoal] = useState<GoalId>("balanced");

  useEffect(() => {
    void readStoredGoal().then(setGoal);
  }, []);

  const slugsKey = useMemo(
    () => [...new Set(basket.entries.map((e) => e.slug))].sort().join(","),
    [basket.entries],
  );

  const lines = useMemo(() => {
    const bySlug = new Map(catalog.map((p) => [p.slug, p]));
    return basket.entries
      .map((e) => {
        const product = bySlug.get(e.slug);
        return product ? { product, qty: e.qty, entryName: e.name } : null;
      })
      .filter(Boolean) as { product: CatalogProduct; qty: number; entryName: string }[];
  }, [basket.entries, catalog]);

  const unresolved = useMemo(() => {
    const loaded = new Set(catalog.map((p) => p.slug));
    return basket.entries.filter((e) => !loaded.has(e.slug));
  }, [basket.entries, catalog]);

  const refreshCatalog = useCallback(async () => {
    if (!basket.hydrated) return;
    if (!basket.slugs.length) {
      setCatalog([]);
      setFetchFailed(false);
      return;
    }
    setLoading(true);
    setFetchFailed(false);
    try {
      const rows = await fetchProductsBySlugs(basket.slugs);
      const order = new Map(basket.slugs.map((s, i) => [s, i]));
      rows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
      setCatalog(rows);
    } catch {
      setCatalog([]);
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [basket.hydrated, basket.slugs]);

  const refreshSwaps = useCallback(async () => {
    if (!slugsKey) {
      setSwaps({});
      return;
    }
    setSwapsLoading(true);
    try {
      const res = await fetchSwaps(slugsKey.split(","), goal);
      setSwaps(res.swaps);
    } catch {
      setSwaps({});
    } finally {
      setSwapsLoading(false);
    }
  }, [slugsKey, goal]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void refreshSwaps();
  }, [refreshSwaps]);

  const pickGoal = async (next: GoalId) => {
    setGoal(next);
    await writeStoredGoal(next);
  };

  const totalInr = lines.reduce((s, l) => s + (l.product.price_inr ?? 0) * l.qty, 0);
  const scores = lines
    .flatMap((l) => Array(l.qty).fill(l.product.core_scores?.score))
    .filter((s): s is number => s != null);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const swapCount = Object.values(swaps).reduce((n, s) => n + s.length, 0);

  const empty = basket.hydrated && basket.count === 0;
  const showLoading = !basket.hydrated || (loading && basket.count > 0 && !lines.length);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SiteHeader />
        <View style={styles.header}>
          <View>
            <Eyebrow>Your shortlist</Eyebrow>
            <SectionTitle style={styles.title}>Basket</SectionTitle>
          </View>
          {basket.count > 0 ? (
            <Pressable onPress={basket.clear}>
              <Text style={[styles.clear, { color: colors.bad }]}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        {showLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : empty ? (
          <Panel style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.fg }]}>Nothing saved yet</Text>
            <Text style={[styles.emptyBody, { color: colors.fgMuted }]}>
              Tap + on any product to build a shortlist while you shop — Scout scores each pick and
              finds better swaps.
            </Text>
            <Pressable
              style={[styles.cta, { backgroundColor: colors.fg }]}
              onPress={() => router.push("/(tabs)/browse")}
            >
              <Text style={[styles.ctaText, { color: colors.bg }]}>Browse catalog</Text>
            </Pressable>
            <Pressable style={styles.ctaSecondary} onPress={() => router.push("/(tabs)")}>
              <Text style={[styles.ctaSecondaryText, { color: colors.accent }]}>Ask Scout</Text>
            </Pressable>
          </Panel>
        ) : (
          <>
            {fetchFailed ? (
              <Panel style={styles.warn}>
                <Text style={[styles.warnTitle, { color: colors.bad }]}>Couldn&apos;t load products</Text>
                <Text style={[styles.warnBody, { color: colors.fgMuted }]}>
                  Check your connection and API URL, then try again.
                </Text>
                <Pressable onPress={() => void refreshCatalog()}>
                  <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
                </Pressable>
              </Panel>
            ) : null}

            {unresolved.length > 0 ? (
              <Panel soft style={styles.warn}>
                <Text style={[styles.warnTitle, { color: colors.fg }]}>
                  {unresolved.length} item{unresolved.length === 1 ? "" : "s"} couldn&apos;t load
                </Text>
                {unresolved.map((e) => (
                  <View key={e.slug} style={styles.unresolvedRow}>
                    <Text style={{ color: colors.fgMuted, flex: 1 }} numberOfLines={1}>
                      {e.name || e.slug}
                      {e.qty > 1 ? ` × ${e.qty}` : ""}
                    </Text>
                    <Pressable onPress={() => basket.remove(e.slug)}>
                      <Text style={{ color: colors.bad, fontSize: 12 }}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </Panel>
            ) : null}

            <Panel style={styles.summary}>
              <Text style={[styles.summaryPrice, { color: colors.fg }]}>
                {totalInr > 0 ? `₹${Math.round(totalInr)}` : "—"}
              </Text>
              <Text style={[styles.summaryMeta, { color: colors.fgMuted }]}>
                {basket.count} item{basket.count === 1 ? "" : "s"}
                {swapsLoading
                  ? " · finding swaps…"
                  : swapCount > 0
                    ? ` · ${swapCount} swap${swapCount === 1 ? "" : "s"}`
                    : ""}
              </Text>
              {avgScore != null ? (
                <View style={styles.summaryScoreRow}>
                  <View
                    style={[styles.summaryBadge, { backgroundColor: catalogTierFill(avgScore) }]}
                  >
                    <Text style={styles.summaryBadgeText}>{avgScore}</Text>
                  </View>
                  <Text style={[styles.summaryCopy, { color: colors.fgMuted }]}>
                    Average Scout score for loaded items
                  </Text>
                </View>
              ) : null}
            </Panel>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goalRow}
            >
              {GOAL_OPTIONS.map((g) => {
                const active = goal === g.id;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => void pickGoal(g.id)}
                    style={[
                      styles.goalChip,
                      {
                        borderColor: active ? colors.accent : colors.line,
                        backgroundColor: active ? colors.accentSoft : colors.panel,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.sansSemiBold,
                        fontSize: 12,
                        color: active ? colors.accent : colors.fgMuted,
                      }}
                    >
                      {g.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Panel style={styles.cart}>
              {lines.map(({ product, qty }) => (
                <BasketCartLine
                  key={product.slug}
                  product={product}
                  qty={qty}
                  swaps={swaps[product.slug] ?? []}
                  swapsLoading={swapsLoading}
                  onDecrement={() => basket.decrement(product.slug)}
                  onIncrement={() => basket.add(product.slug, product.name)}
                  onRemove={() => basket.remove(product.slug)}
                  onSwap={(swap) => basket.replace(product.slug, swap.slug, swap.name)}
                />
              ))}
            </Panel>

            <Pressable style={styles.addMore} onPress={() => router.push("/(tabs)/browse")}>
              <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Add more items</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  title: { fontSize: 26, marginTop: 4 },
  clear: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
  empty: { margin: spacing.lg, alignItems: "center" },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22 },
  emptyBody: {
    fontFamily: fonts.sans,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  cta: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.full,
    width: "100%",
    alignItems: "center",
  },
  ctaText: { fontFamily: fonts.sansBold },
  ctaSecondary: { marginTop: spacing.sm, padding: spacing.sm },
  ctaSecondaryText: { fontFamily: fonts.sansSemiBold },
  warn: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  warnTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
  warnBody: { fontFamily: fonts.sans, fontSize: 13, marginTop: 4, marginBottom: spacing.sm },
  unresolvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  summary: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  summaryPrice: { fontFamily: fonts.display, fontSize: 28 },
  summaryMeta: { fontFamily: fonts.sans, fontSize: 13, marginTop: 4 },
  summaryScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  summaryBadge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryBadgeText: { fontFamily: fonts.display, fontSize: 24, color: "#fff" },
  summaryCopy: { flex: 1, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  goalRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  goalChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cart: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  addMore: { alignItems: "center", marginTop: spacing.lg, padding: spacing.md },
});
