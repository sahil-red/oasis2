import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { Screen } from "@/components/Screen";
import { SiteHeader } from "@/components/SiteHeader";
import { Eyebrow } from "@/components/ui/Typography";
import { fetchCatalogMeta, fetchCatalogSearch } from "@/lib/api";
import { colors, fonts, radius, spacing, typography } from "@/theme";
import type { CatalogProduct } from "@/types/api";

const VERDICT_FILTERS = [
  { id: "", label: "All" },
  { id: "daily_staple", label: "Staple" },
  { id: "good_choice", label: "Good" },
  { id: "occasional_treat", label: "Treat" },
  { id: "skip", label: "Skip" },
] as const;

export default function BrowseTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; verdict?: string; goal?: string; q?: string }>();
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState(params.category ?? "");
  const [verdict, setVerdict] = useState(params.verdict ?? "");
  const [query, setQuery] = useState(params.q ?? "");
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchCatalogMeta()
      .then((m) => setCategories(m.filters.categories.slice(0, 16)))
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
          sort: "score-desc",
          ...(category ? { category } : {}),
          ...(verdict ? { verdict } : {}),
          ...(query.trim() ? { q: query.trim() } : {}),
        });
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
        setHasMore(res.hasMore);
        setPage(pageNum);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, verdict, query],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  const ListHeader = (
    <>
      <SiteHeader />
      <Eyebrow style={styles.eyebrow}>Catalog</Eyebrow>
      <Text style={styles.title}>Browse scored products</Text>

      {/* AI search entry */}
      <Pressable
        style={styles.aiBar}
        onPress={() => router.push("/search")}
      >
        <Ionicons name="sparkles" size={16} color={colors.accent} />
        <Text style={styles.aiBarText}>Ask Scout anything…</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.fgDim} />
      </Pressable>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or brand…"
        placeholderTextColor={colors.fgDim}
        returnKeyType="search"
        onSubmitEditing={() => void load(1, true)}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.verdictRow}
        contentContainerStyle={styles.chipRow}
      >
        {VERDICT_FILTERS.map((v) => {
          const active = verdict === v.id;
          return (
            <Pressable
              key={v.id || "all"}
              style={[styles.verdictChip, active && styles.verdictChipActive]}
              onPress={() => setVerdict(v.id)}
            >
              <Text style={[styles.verdictText, active && styles.verdictTextActive]}>{v.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chips}
        contentContainerStyle={styles.chipRow}
      >
        {["All", ...categories].map((c) => {
          const active = (c === "All" && !category) || c === category;
          return (
            <Pressable
              key={c}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c === "All" ? "" : c)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );

  return (
    <Screen>
      {loading && items.length === 0 ? (
        <View style={{ flex: 1 }}>
          {ListHeader}
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          ListHeaderComponent={ListHeader}
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
  eyebrow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  title: {
    ...typography.sectionTitle,
    fontSize: 26,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.fg,
  },
  chipRow: { gap: 8, paddingHorizontal: spacing.lg, flexDirection: "row" },
  verdictRow: { maxHeight: 44, marginBottom: spacing.sm },
  verdictChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  verdictChipActive: { backgroundColor: colors.fg, borderColor: colors.fg },
  verdictText: { fontFamily: fonts.sansMedium, color: colors.fgMuted, fontSize: 13 },
  verdictTextActive: { color: colors.bg },
  chips: { maxHeight: 48, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 13 },
  chipTextActive: { fontFamily: fonts.sansSemiBold, color: colors.accent },
  grid: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xl },
  aiBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  aiBarText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.fgDim,
  },
});
