import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScoreBadge } from "@/components/ScoreBadge";
import { VerdictPill } from "@/components/VerdictPill";
import { Screen } from "@/components/Screen";
import { fetchProduct } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { VERDICT_COLORS, VERDICT_SHORT, formatPrice, resolveVerdict } from "@/lib/verdict";
import { colors, radius, spacing, typography } from "@/theme";
import type { ProductDetail, VerdictId } from "@/types/api";

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const basket = useBasket();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchProduct(slug)
      .then(setProduct)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [slug]);

  const verdict =
    (product?.verdict_resolved as VerdictId | null) ??
    (product ? resolveVerdict(product) : null);
  const vc = verdict ? VERDICT_COLORS[verdict] : null;
  const n = product?.nutrition;

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.fg} />
        </Pressable>
        <Pressable
          onPress={() => product && basket.add(product.slug)}
          hitSlop={12}
        >
          <Ionicons
            name={product && basket.has(product.slug) ? "checkmark-circle" : "add-circle"}
            size={30}
            color={colors.accent}
          />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : product ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.imageWrap}>
            {product.image_urls[0] ? (
              <Image
                source={{ uri: product.image_urls[0] }}
                style={styles.image}
                contentFit="contain"
              />
            ) : null}
          </View>

          <Text style={styles.name}>{product.name}</Text>
          {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}
          <Text style={styles.price}>{formatPrice(product)}</Text>

          <View style={styles.scoreRow}>
            <VerdictPill product={product} />
            <ScoreBadge score={product.core_scores?.score} label="SCOUT" />
          </View>

          {verdict && vc ? (
            <LinearGradient
              colors={[vc.bg, "transparent"]}
              style={styles.verdictBanner}
            >
              <Text style={[styles.verdictTitle, { color: vc.fg }]}>
                {VERDICT_SHORT[verdict]}
              </Text>
              <Text style={styles.verdictDesc}>
                {product.core_scores?.band
                  ? `Health band: ${product.core_scores.band}`
                  : "Based on label nutrition and ingredients"}
              </Text>
            </LinearGradient>
          ) : null}

          {n ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nutrition per 100g</Text>
              <View style={styles.nutritionGrid}>
                {n.sugar_g_100g != null ? (
                  <NutritionCell label="Sugar" value={`${n.sugar_g_100g}g`} />
                ) : null}
                {n.protein_g_100g != null ? (
                  <NutritionCell label="Protein" value={`${n.protein_g_100g}g`} />
                ) : null}
                {n.fat_g_100g != null ? (
                  <NutritionCell label="Fat" value={`${n.fat_g_100g}g`} />
                ) : null}
                {n.fiber_g_100g != null ? (
                  <NutritionCell label="Fiber" value={`${n.fiber_g_100g}g`} />
                ) : null}
                {n.energy_kcal_100g != null ? (
                  <NutritionCell label="Energy" value={`${Math.round(n.energy_kcal_100g)} kcal`} />
                ) : null}
                {n.sodium_mg_100g != null ? (
                  <NutritionCell label="Sodium" value={`${n.sodium_mg_100g}mg`} />
                ) : null}
              </View>
            </View>
          ) : null}

          {product.ingredients_raw ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <Text style={styles.ingredients}>{product.ingredients_raw}</Text>
            </View>
          ) : null}

          {product.core_scores?.concerns?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Why Scout flagged this</Text>
              {product.core_scores.concerns.slice(0, 4).map((c) => (
                <Text key={c.message} style={styles.concern}>
                  · {c.message}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function NutritionCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  scroll: { paddingBottom: spacing.xl * 2 },
  imageWrap: {
    marginHorizontal: spacing.lg,
    aspectRatio: 1,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  name: {
    ...typography.title,
    color: colors.fg,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  brand: { color: colors.fgMuted, paddingHorizontal: spacing.lg, marginTop: 4 },
  price: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.fg,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  scoreRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    alignItems: "center",
  },
  verdictBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  verdictTitle: { fontSize: 20, fontWeight: "700" },
  verdictDesc: { color: colors.fgMuted, marginTop: 4, fontSize: 14 },
  section: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionTitle: { ...typography.caption, color: colors.fgDim, marginBottom: spacing.sm },
  nutritionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: {
    width: "30%",
    minWidth: 96,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  cellLabel: { fontSize: 11, color: colors.fgDim },
  cellValue: { fontSize: 16, fontWeight: "600", color: colors.fg, marginTop: 2 },
  ingredients: { color: colors.fgMuted, fontSize: 14, lineHeight: 22 },
  concern: { color: colors.fgMuted, fontSize: 14, marginTop: 6 },
  error: { color: colors.bad, padding: spacing.lg },
});
