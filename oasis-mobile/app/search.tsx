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
  View,
} from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { ScoutSearchBar } from "@/components/ScoutSearchBar";
import { Screen } from "@/components/Screen";
import { Panel } from "@/components/ui/Panel";
import { fetchAiSearch, fetchCatalogMeta, fetchLexicalSearch } from "@/lib/api";
import { classifyIntent } from "@/lib/search-intent";
import { useAccessToken } from "@/lib/auth";
import { colors, fonts, radius, spacing, typography } from "@/theme";
import type { AiSearchResult, CatalogMeta, CatalogProduct } from "@/types/api";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const token = useAccessToken();
  const [prompt, setPrompt] = useState(params.q ?? "");
  const [result, setResult] = useState<AiSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogMeta, setCatalogMeta] = useState<CatalogMeta | null>(null);

  useEffect(() => {
    fetchCatalogMeta().then(setCatalogMeta).catch(() => setCatalogMeta(null));
  }, []);

  const run = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setLoading(true);
      setError(null);
      try {
        const intent = classifyIntent(trimmed, {
          brands: catalogMeta?.filters.brands,
          subcategories: catalogMeta?.filters.subcategories,
        });
        const data =
          intent === "lexical"
            ? await fetchLexicalSearch(trimmed, 24)
            : await fetchAiSearch(trimmed, token, 24, intent === "complex" ? "complex" : "structured");
        setResult(data);
        setPrompt(trimmed);
      } catch (e) {
        const err = e as Error & { code?: string; status?: number };
        if (err.code === "quota_exceeded" || err.status === 402) {
          setError("Daily AI limit reached. Upgrade to Scout Plus for unlimited search.");
        } else {
          setError(err.message);
        }
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [token, catalogMeta?.filters.brands, catalogMeta?.filters.subcategories],
  );

  useEffect(() => {
    if (params.q && params.q.length >= 2) void run(params.q);
  }, [params.q, run]);

  const ListHeader = (
    <>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.fg} />
        </Pressable>
        <Text style={styles.headerTitle}>Ask Scout</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.searchWrap}>
        <ScoutSearchBar
          value={prompt}
          onChangeText={setPrompt}
          onSubmit={() => void run(prompt)}
          loading={loading}
        />
      </View>

      {loading && !result ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Scout is reading labels and ranking matches…</Text>
        </View>
      ) : null}

      {error ? (
        <Panel style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {error.includes("Upgrade") ? (
            <Pressable style={styles.upgradeBtn} onPress={() => router.push("/subscribe")}>
              <Text style={styles.upgradeBtnText}>Get Scout Plus</Text>
            </Pressable>
          ) : null}
        </Panel>
      ) : null}

      {result ? (
        <Panel style={styles.summaryPanel}>
          <Text style={styles.summary}>{result.summary}</Text>
          {result.relaxed ? (
            <Text style={styles.relaxed}>Showing closest matches — criteria relaxed slightly.</Text>
          ) : null}
          {result.refinements?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.refineRow}>
              {result.refinements.map((r) => (
                <Pressable key={r} style={styles.refineChip} onPress={() => void run(r)}>
                  <Text style={styles.refineText}>{r}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </Panel>
      ) : null}
    </>
  );

  return (
    <Screen>
      {result ? (
        <FlatList
          data={result.items}
          keyExtractor={(p: CatalogProduct) => p.id}
          numColumns={2}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <ProductCard product={item} aiReasons={item.ai_match_reasons} />
          )}
        />
      ) : (
        <View style={{ flex: 1 }}>{ListHeader}</View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.title, fontSize: 18, color: colors.fg },
  searchWrap: { paddingHorizontal: spacing.lg },
  center: { padding: spacing.xl, alignItems: "center" },
  loadingText: {
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: 14,
  },
  errorBox: { margin: spacing.lg },
  errorText: { fontFamily: fonts.sans, color: colors.bad, fontSize: 15 },
  upgradeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.fg,
    padding: 12,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  upgradeBtnText: { fontFamily: fonts.sansBold, color: colors.bg },
  summaryPanel: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  summary: { fontFamily: fonts.sans, color: colors.fg, fontSize: 15, lineHeight: 22 },
  relaxed: { fontFamily: fonts.sans, color: colors.fgDim, fontSize: 12, marginTop: spacing.sm },
  refineRow: { marginTop: spacing.md, maxHeight: 40 },
  refineChip: {
    marginRight: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  refineText: { fontFamily: fonts.sansMedium, color: colors.fg, fontSize: 13 },
  grid: { padding: spacing.sm, paddingBottom: spacing.xl },
});
