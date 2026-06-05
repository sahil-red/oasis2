import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { Screen } from "@/components/Screen";
import { fetchProductsBySlugs } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { colors, spacing, typography } from "@/theme";
import type { CatalogProduct } from "@/types/api";

export default function BasketTab() {
  const router = useRouter();
  const basket = useBasket();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!basket.slugs.length) {
      setProducts([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchProductsBySlugs(basket.slugs);
      const order = new Map(basket.slugs.map((s, i) => [s, i]));
      rows.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
      setProducts(rows);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [basket.slugs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Basket</Text>
        {basket.count > 0 ? (
          <Pressable onPress={basket.clear}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : basket.count === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyBody}>
            Tap + on any product to build a shortlist while you shop.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push("/(tabs)/browse")}>
            <Text style={styles.ctaText}>Browse catalog</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <ProductCard product={item} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: { ...typography.title, color: colors.fg },
  clear: { color: colors.bad, fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", padding: spacing.xl, alignItems: "center" },
  emptyTitle: { ...typography.title, color: colors.fg },
  emptyBody: { color: colors.fgMuted, textAlign: "center", marginTop: spacing.sm },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaText: { color: colors.bg, fontWeight: "700" },
  grid: { padding: spacing.sm, paddingBottom: spacing.xl },
});
