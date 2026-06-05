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
import { fetchCatalogMeta, fetchCatalogSearch } from "@/lib/api";
import { colors, spacing, typography } from "@/theme";
import type { CatalogProduct } from "@/types/api";

export default function BrowseTab() {
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("");
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchCatalogMeta()
      .then((m) => setCategories(m.filters.categories.slice(0, 12)))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetchCatalogSearch({
          page: pageNum,
          limit: 24,
          scored: "1",
          ...(category ? { category } : {}),
        });
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setHasMore(res.hasMore);
        setPage(pageNum);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  return (
    <Screen>
      <Text style={styles.title}>Browse</Text>
      <FlatList
        horizontal
        data={["All", ...categories]}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        style={styles.chips}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
        renderItem={({ item: c }) => {
          const active = (c === "All" && !category) || c === category;
          return (
            <Pressable
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c === "All" ? "" : c)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        }}
      />
      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          onEndReached={() => {
            if (hasMore && !loadingMore) void load(page + 1, false);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.accent} style={{ margin: 16 }} /> : null
          }
          renderItem={({ item }) => <ProductCard product={item} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.fg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chips: { maxHeight: 48, marginVertical: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.fgMuted, fontSize: 13 },
  chipTextActive: { color: colors.accent, fontWeight: "600" },
  grid: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xl },
});
