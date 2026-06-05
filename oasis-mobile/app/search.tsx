import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { ScoutSearchBar } from "@/components/ScoutSearchBar";
import { Screen } from "@/components/Screen";
import { fetchAiSearch } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { colors, spacing, typography } from "@/theme";
import type { AiSearchResult, CatalogProduct } from "@/types/api";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const token = useAccessToken();
  const [prompt, setPrompt] = useState(params.q ?? "");
  const [result, setResult] = useState<AiSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAiSearch(trimmed, token, 24);
        setResult(data);
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
    [token],
  );

  useEffect(() => {
    if (params.q && params.q.length >= 2) void run(params.q);
  }, [params.q, run]);

  return (
    <Screen>
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
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {error.includes("Upgrade") ? (
            <Pressable style={styles.upgradeBtn} onPress={() => router.push("/subscribe")}>
              <Text style={styles.upgradeBtnText}>Get Scout Plus</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {result ? (
        <>
          <Text style={styles.summary}>{result.summary}</Text>
          <FlatList
            data={result.items}
            keyExtractor={(p: CatalogProduct) => p.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <ProductCard product={item} aiReasons={item.ai_match_reasons} />
            )}
          />
        </>
      ) : null}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  loadingText: { color: colors.fgMuted, marginTop: spacing.md, textAlign: "center" },
  errorBox: { margin: spacing.lg, padding: spacing.md, backgroundColor: colors.panel, borderRadius: 12 },
  errorText: { color: colors.bad, fontSize: 15 },
  upgradeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  upgradeBtnText: { color: colors.bg, fontWeight: "700" },
  summary: { color: colors.fgMuted, paddingHorizontal: spacing.lg, marginBottom: spacing.sm, fontSize: 14 },
  grid: { padding: spacing.sm, paddingBottom: spacing.xl },
});
