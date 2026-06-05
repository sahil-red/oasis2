import { Image } from "expo-image";
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
import { ProductCard } from "@/components/ProductCard";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { Panel } from "@/components/ui/Panel";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { fetchProductsBySlugs, fetchSwaps } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { catalogTierFill } from "@/lib/score";
import { colors, fonts, radius, spacing } from "@/theme";
import type { CatalogProduct, SwapSuggestion } from "@/types/api";

export default function BasketTab() {
  const router = useRouter();
  const basket = useBasket();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [swaps, setSwaps] = useState<Record<string, SwapSuggestion[]>>({});
  const [loading, setLoading] = useState(false);

  const avgScore = useMemo(() => {
    const scores = products
      .map((p) => p.core_scores?.score)
      .filter((s): s is number => s != null);
    if (!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [products]);

  const refresh = useCallback(async () => {
    if (!basket.slugs.length) {
      setProducts([]);
      setSwaps({});
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchProductsBySlugs(basket.slugs);
      const order = new Map(basket.slugs.map((s, i) => [s, i]));
      rows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
      setProducts(rows);
      const swapRes = await fetchSwaps(basket.slugs.slice(0, 8));
      setSwaps(swapRes.swaps);
    } catch {
      setProducts([]);
      setSwaps({});
    } finally {
      setLoading(false);
    }
  }, [basket.slugs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
              <Text style={styles.clear}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : basket.count === 0 ? (
          <Panel style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.emptyBody}>
              Tap + on any product to build a shortlist while you shop — Scout scores each pick.
            </Text>
            <Pressable style={styles.cta} onPress={() => router.push("/(tabs)/browse")}>
              <Text style={styles.ctaText}>Browse catalog</Text>
            </Pressable>
            <Pressable style={styles.ctaSecondary} onPress={() => router.push("/(tabs)")}>
              <Text style={styles.ctaSecondaryText}>Ask Scout</Text>
            </Pressable>
          </Panel>
        ) : (
          <>
            {avgScore != null ? (
              <Panel soft style={styles.analysis}>
                <Text style={styles.analysisLabel}>Basket health score</Text>
                <View style={styles.analysisRow}>
                  <View
                    style={[styles.analysisBadge, { backgroundColor: catalogTierFill(avgScore) }]}
                  >
                    <Text style={styles.analysisScore}>{avgScore}</Text>
                  </View>
                  <Text style={styles.analysisCopy}>
                    Average Scout score across {products.length} item
                    {products.length === 1 ? "" : "s"} in your shortlist.
                  </Text>
                </View>
              </Panel>
            ) : null}

            <View style={styles.grid}>
              {products.map((item) => (
                <View key={item.id} style={styles.gridItem}>
                  <ProductCard product={item} />
                  <Pressable
                    style={styles.remove}
                    onPress={() => basket.remove(item.slug)}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                  {swaps[item.slug]?.length ? (
                    <View style={styles.swapBlock}>
                      <Text style={styles.swapTitle}>Better swaps</Text>
                      {swaps[item.slug]!.slice(0, 2).map((swap) => (
                        <Pressable
                          key={swap.slug}
                          style={styles.swapRow}
                          onPress={() => router.push(`/product/${swap.slug}`)}
                        >
                          {swap.image_urls[0] ? (
                            <Image
                              source={{ uri: swap.image_urls[0] }}
                              style={styles.swapThumb}
                              contentFit="contain"
                            />
                          ) : null}
                          <View style={styles.swapBody}>
                            <Text style={styles.swapName} numberOfLines={1}>
                              {swap.name}
                            </Text>
                            <Text style={styles.swapReason} numberOfLines={2}>
                              {swap.reason}
                            </Text>
                          </View>
                          <Text style={styles.swapDelta}>+{swap.delta_score}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
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
  clear: { fontFamily: fonts.sansSemiBold, color: colors.bad, fontSize: 14 },
  empty: { margin: spacing.lg, alignItems: "center" },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.fg },
  emptyBody: {
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.fg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.full,
    width: "100%",
    alignItems: "center",
  },
  ctaText: { fontFamily: fonts.sansBold, color: colors.bg },
  ctaSecondary: { marginTop: spacing.sm, padding: spacing.sm },
  ctaSecondaryText: { fontFamily: fonts.sansSemiBold, color: colors.accent },
  analysis: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  analysisLabel: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.fgDim, textTransform: "uppercase", letterSpacing: 1 },
  analysisRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm, alignItems: "center" },
  analysisBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  analysisScore: { fontFamily: fonts.display, fontSize: 26, color: "#fff" },
  analysisCopy: { flex: 1, fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, lineHeight: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
  },
  gridItem: { width: "50%" },
  remove: { alignItems: "center", paddingBottom: spacing.md },
  removeText: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim },
  swapBlock: {
    marginHorizontal: spacing.xs,
    marginBottom: spacing.lg,
    padding: spacing.sm,
    backgroundColor: colors.bgSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  swapTitle: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.fgDim, marginBottom: spacing.sm },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  swapThumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.panel },
  swapBody: { flex: 1 },
  swapName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.fg },
  swapReason: { fontFamily: fonts.sans, fontSize: 11, color: colors.fgMuted, marginTop: 2 },
  swapDelta: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.good },
});
