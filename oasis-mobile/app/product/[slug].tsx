import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScoreBadge } from "@/components/ScoreBadge";
import { VerdictPill } from "@/components/VerdictPill";
import { Screen } from "@/components/Screen";
import { Panel } from "@/components/ui/Panel";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { fetchProduct } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { labelForBand, bandFromScore } from "@/lib/score";
import { VERDICT_COLORS, VERDICT_SHORT, formatPrice, resolveVerdict } from "@/lib/verdict";
import { colors, fonts, radius, spacing, typography } from "@/theme";
import type { ProductDetail, VerdictId } from "@/types/api";

const { width: SCREEN_W } = Dimensions.get("window");

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const basket = useBasket();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);

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
  const core = product?.core_scores;
  const images = product?.image_urls?.length ? product.image_urls : [];

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
            color={product && basket.has(product.slug) ? colors.good : colors.fg}
          />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : product ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.gallery}>
            {images.length ? (
              <>
                <FlatList
                  data={images}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(uri, i) => `${uri}-${i}`}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - spacing.lg * 2));
                    setImageIndex(i);
                  }}
                  renderItem={({ item }) => (
                    <Image
                      source={{ uri: item }}
                      style={styles.galleryImage}
                      contentFit="contain"
                    />
                  )}
                />
                {images.length > 1 ? (
                  <View style={styles.dots}>
                    {images.map((_, i) => (
                      <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.galleryEmpty}>
                <Text style={styles.galleryEmptyText}>No image</Text>
              </View>
            )}
          </View>

          {product.brand ? (
            <Text style={styles.brandEyebrow}>{product.brand.toUpperCase()}</Text>
          ) : null}
          <Text style={styles.name}>{product.name}</Text>

          {/* Chips row */}
          {product.deepseek_chips?.length || product.core_scores?.verdict_sublabels?.length ? (
            <ChipsRow chips={product.deepseek_chips ?? product.core_scores?.verdict_sublabels ?? []} />
          ) : null}

          {/* Scout's one-liner */}
          {product.deepseek_why ? (
            <View style={styles.whyBox}>
              <Text style={styles.whyLabel}>Scout says</Text>
              <Text style={styles.why}>{product.deepseek_why}</Text>
            </View>
          ) : null}

          <Text style={styles.price}>{formatPrice(product)}</Text>
          {product.mrp_inr && product.price_inr && product.mrp_inr > product.price_inr ? (
            <Text style={styles.mrp}>MRP ₹{Math.round(product.mrp_inr)}</Text>
          ) : null}

          <View style={styles.scoreRow}>
            <VerdictPill product={product} />
            <ScoreBadge score={core?.score} product={product} label="SCOUT" />
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
                {core?.band
                  ? `${labelForBand(bandFromScore(core.score))} · Grade ${core.grade}`
                  : "Based on label nutrition and ingredients"}
              </Text>
            </LinearGradient>
          ) : null}

          {core?.subscores ? (
            <Panel style={styles.section}>
              <Eyebrow>Score breakdown</Eyebrow>
              <SubscoreBar label="Nutrition" value={core.subscores.nutrition} />
              <SubscoreBar label="Additives" value={core.subscores.additives} />
              <SubscoreBar label="Labels" value={core.subscores.labels} />
            </Panel>
          ) : null}

          {n ? (
            <Panel style={styles.section}>
              <SectionTitle style={styles.sectionTitleSm}>Nutrition per 100g</SectionTitle>
              <View style={styles.nutritionGrid}>
                {n.sugar_g_100g != null ? (
                  <NutritionCell label="Sugar" value={`${n.sugar_g_100g}g`} highlight={n.sugar_g_100g > 10} />
                ) : null}
                {n.added_sugar_g_100g != null ? (
                  <NutritionCell label="Added sugar" value={`${n.added_sugar_g_100g}g`} />
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
            </Panel>
          ) : null}

          {product.ingredients_raw ? (
            <Panel style={styles.section}>
              <SectionTitle style={styles.sectionTitleSm}>Ingredients</SectionTitle>
              <Text style={styles.ingredients}>{product.ingredients_raw}</Text>
            </Panel>
          ) : null}

          {core?.concerns?.length ? (
            <Panel style={styles.section}>
              <SectionTitle style={styles.sectionTitleSm}>Why Scout flagged this</SectionTitle>
              {core.concerns.map((c) => (
                <View key={c.message} style={styles.concernRow}>
                  <View
                    style={[
                      styles.concernDot,
                      {
                        backgroundColor:
                          c.severity === "high"
                            ? colors.bad
                            : c.severity === "medium"
                              ? colors.warn
                              : colors.fgDim,
                      },
                    ]}
                  />
                  <Text style={styles.concern}>{c.message}</Text>
                </View>
              ))}
            </Panel>
          ) : null}

          <Pressable
            style={styles.basketCta}
            onPress={() => basket.add(product.slug)}
          >
            <Text style={styles.basketCtaText}>
              {basket.has(product.slug) ? "In your basket" : "Add to basket"}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const CHIP_LABELS: Record<string, string> = {
  high_protein: "High Protein", low_sugar: "Low Sugar", no_added_sugar: "No Added Sugar",
  high_fiber: "High Fiber", gluten_free: "Gluten Free", vegan: "Vegan",
  high_sugar: "High Sugar", hidden_sweetener: "Hidden Sweetener",
  artificial_colors: "Artificial Colours", ultra_processed: "Ultra Processed",
  contains_preservatives: "Preservatives", high_sodium: "High Sodium",
};
const CHIP_GOOD = new Set(["high_protein","low_sugar","no_added_sugar","high_fiber","gluten_free","vegan"]);
const CHIP_BAD = new Set(["high_sugar","hidden_sweetener","ultra_processed"]);

function ChipsRow({ chips }: { chips: string[] }) {
  if (!chips.length) return null;
  return (
    <View style={chipRowStyles.row}>
      {chips.slice(0, 6).map((chip) => {
        const label = CHIP_LABELS[chip] ?? chip.replace(/_/g, " ");
        const bg = CHIP_GOOD.has(chip)
          ? "rgba(52,211,153,0.12)" : CHIP_BAD.has(chip)
          ? "rgba(248,113,113,0.12)" : "rgba(251,191,36,0.12)";
        const border = CHIP_GOOD.has(chip)
          ? "rgba(52,211,153,0.4)" : CHIP_BAD.has(chip)
          ? "rgba(248,113,113,0.35)" : "rgba(251,191,36,0.4)";
        const text = CHIP_GOOD.has(chip) ? "#34d399" : CHIP_BAD.has(chip) ? "#f87171" : "#fbbf24";
        return (
          <View key={chip} style={[chipRowStyles.chip, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[chipRowStyles.text, { color: text }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}
const chipRowStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
});

function NutritionCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.cell, highlight && styles.cellWarn]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

function SubscoreBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.subscoreRow}>
      <Text style={styles.subscoreLabel}>{label}</Text>
      <View style={styles.subscoreTrack}>
        <View style={[styles.subscoreFill, { width: `${Math.min(100, value)}%` }]} />
      </View>
      <Text style={styles.subscoreVal}>{Math.round(value)}</Text>
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
  scroll: { paddingBottom: spacing.xxl * 2 },
  gallery: {
    marginHorizontal: spacing.lg,
    aspectRatio: 1,
    backgroundColor: colors.bgSoft,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  galleryImage: { width: SCREEN_W - spacing.lg * 2, height: SCREEN_W - spacing.lg * 2 },
  galleryEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  galleryEmptyText: { color: colors.fgDim },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.fg },
  brandEyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.fgDim,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: colors.fg,
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  whyBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(41,151,255,0.08)",
    borderRadius: radius.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  whyLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  why: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.fg,
    lineHeight: 20,
  },
  price: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.fg,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  mrp: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.fgDim,
    textDecorationLine: "line-through",
    paddingHorizontal: spacing.lg,
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
    borderRadius: radius.xl,
  },
  verdictTitle: { fontFamily: fonts.display, fontSize: 24 },
  verdictDesc: { fontFamily: fonts.sans, color: colors.fgMuted, marginTop: 4, fontSize: 14 },
  section: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  sectionTitleSm: { fontSize: 20, marginBottom: spacing.sm },
  nutritionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: {
    width: "30%",
    minWidth: 96,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  cellWarn: { borderWidth: 1, borderColor: colors.warn },
  cellLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.fgDim },
  cellValue: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.fg, marginTop: 2 },
  ingredients: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, lineHeight: 22 },
  concernRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "flex-start" },
  concernDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  concern: { flex: 1, fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, lineHeight: 20 },
  subscoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  subscoreLabel: { fontFamily: fonts.sans, width: 72, fontSize: 13, color: colors.fgMuted },
  subscoreTrack: { flex: 1, height: 6, backgroundColor: colors.panel2, borderRadius: 3, overflow: "hidden" },
  subscoreFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 3 },
  subscoreVal: { fontFamily: fonts.sansSemiBold, width: 28, textAlign: "right", color: colors.fg },
  basketCta: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.fg,
    paddingVertical: 16,
    borderRadius: radius.xl,
    alignItems: "center",
  },
  basketCtaText: { fontFamily: fonts.sansBold, color: colors.bg, fontSize: 16 },
  error: { fontFamily: fonts.sans, color: colors.bad, padding: spacing.lg },
});
