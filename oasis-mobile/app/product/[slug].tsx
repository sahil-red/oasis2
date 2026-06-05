import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { PdpIngredients } from "@/components/pdp/PdpIngredients";
import { PdpNutrition } from "@/components/pdp/PdpNutrition";
import { PdpScoreWhy } from "@/components/pdp/PdpScoreWhy";
import { PdpSwaps } from "@/components/pdp/PdpSwaps";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VerdictPill } from "@/components/VerdictPill";
import { Screen } from "@/components/Screen";
import { Panel } from "@/components/ui/Panel";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { fetchProduct } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { useTheme } from "@/lib/theme-context";
import { labelForBand, bandFromScore } from "@/lib/score";
import { VERDICT_COLORS, VERDICT_SHORT, formatPrice, resolveVerdict } from "@/lib/verdict";
import { fonts, radius, spacing, type ThemeColors } from "@/theme";
import type { ProductDetail, VerdictId } from "@/types/api";

const { width: SCREEN_W } = Dimensions.get("window");

const CHIP_LABELS: Record<string, string> = {
  high_protein: "High Protein",
  low_sugar: "Low Sugar",
  no_added_sugar: "No Added Sugar",
  high_fiber: "High Fiber",
  gluten_free: "Gluten Free",
  vegan: "Vegan",
  high_sugar: "High Sugar",
  hidden_sweetener: "Hidden Sweetener",
  artificial_colors: "Artificial Colours",
  ultra_processed: "Ultra Processed",
  contains_preservatives: "Preservatives",
  high_sodium: "High Sodium",
};
const CHIP_GOOD = new Set([
  "high_protein",
  "low_sugar",
  "no_added_sugar",
  "high_fiber",
  "gluten_free",
  "vegan",
]);
const CHIP_BAD = new Set(["high_sugar", "hidden_sweetener", "ultra_processed"]);

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const basket = useBasket();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const core = product?.core_scores;
  const images = product?.image_urls?.length ? product.image_urls : [];
  const chips = product?.deepseek_chips?.length
    ? product.deepseek_chips
    : (product?.core_scores?.verdict_sublabels ?? []);
  const swapDesc = product?.subcategory
    ? `Better options in ${product.subcategory}${product.brand ? ` — not just more ${product.brand}` : ""}.`
    : "Alternatives with better nutrition or Scout score.";

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.fg} />
        </Pressable>
        <View style={styles.navRight}>
          <ThemeToggle />
          <Pressable
            onPress={() => product && basket.add(product.slug, product.name)}
            hitSlop={12}
          >
            <Ionicons
              name={product && basket.has(product.slug) ? "checkmark-circle" : "add-circle"}
              size={30}
              color={product && basket.has(product.slug) ? colors.good : colors.fg}
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : product ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.gallery, { backgroundColor: colors.bgSoft, borderColor: colors.line }]}>
            {images.length ? (
              <>
                <FlatList
                  data={images}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(uri, i) => `${uri}-${i}`}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(
                      e.nativeEvent.contentOffset.x / (SCREEN_W - spacing.lg * 2),
                    );
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
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          { backgroundColor: colors.line },
                          i === imageIndex && { backgroundColor: colors.fg },
                        ]}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.galleryEmpty}>
                <Text style={{ color: colors.fgDim }}>No image</Text>
              </View>
            )}
          </View>

          {product.brand ? (
            <Text style={[styles.brandEyebrow, { color: colors.fgDim }]}>
              {product.brand.toUpperCase()}
            </Text>
          ) : null}
          <Text style={[styles.name, { color: colors.fg }]}>{product.name}</Text>

          {chips.length ? <ChipsRow chips={chips} colors={colors} /> : null}

          {product.deepseek_why ? (
            <View style={[styles.whyBox, { borderLeftColor: colors.accent, backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.whyLabel, { color: colors.accent }]}>Scout says</Text>
              <Text style={[styles.why, { color: colors.fg }]}>{product.deepseek_why}</Text>
            </View>
          ) : null}

          <Text style={[styles.price, { color: colors.fg }]}>{formatPrice(product)}</Text>
          {product.mrp_inr && product.price_inr && product.mrp_inr > product.price_inr ? (
            <Text style={[styles.mrp, { color: colors.fgDim }]}>MRP ₹{Math.round(product.mrp_inr)}</Text>
          ) : null}

          <View style={styles.scoreRow}>
            <VerdictPill product={product} />
            <ScoreBadge score={core?.score} product={product} label="SCOUT" />
          </View>

          {verdict && vc ? (
            <LinearGradient colors={[vc.bg, "transparent"]} style={styles.verdictBanner}>
              <Text style={[styles.verdictTitle, { color: vc.fg }]}>{VERDICT_SHORT[verdict]}</Text>
              <Text style={[styles.verdictDesc, { color: colors.fgMuted }]}>
                {core?.band
                  ? `${labelForBand(bandFromScore(core.score))} · Grade ${core.grade}`
                  : "Based on label nutrition and ingredients"}
              </Text>
            </LinearGradient>
          ) : null}

          <PdpScoreWhy explanation={product.score_why} deepseekWhy={product.deepseek_why} />

          {product.swaps?.length ? (
            <PdpSwaps title="Better swaps" description={swapDesc} swaps={product.swaps} />
          ) : null}

          {core?.subscores ? (
            <Panel style={styles.section}>
              <Eyebrow>Score breakdown</Eyebrow>
              <SubscoreBar label="Nutrition" value={core.subscores.nutrition} colors={colors} />
              <SubscoreBar label="Additives" value={core.subscores.additives} colors={colors} />
              <SubscoreBar label="Labels" value={core.subscores.labels} colors={colors} />
            </Panel>
          ) : null}

          {product.nutrition_display?.rows.length ? (
            <PdpNutrition
              rows={product.nutrition_display.rows}
              anomalies={product.nutrition_anomalies ?? []}
              hasServe={product.nutrition_display.hasServe}
              serveG={product.nutrition_display.serveG}
              packLabel={product.nutrition_display.packLabel}
            />
          ) : null}

          {product.ingredient_items?.length ? (
            <PdpIngredients items={product.ingredient_items} />
          ) : product.ingredients_raw ? (
            <Panel style={styles.section}>
              <SectionTitle style={styles.sectionTitleSm}>Ingredients</SectionTitle>
              <Text style={[styles.ingredients, { color: colors.fgMuted }]}>
                {product.ingredients_raw}
              </Text>
            </Panel>
          ) : null}

          {core?.concerns?.length ? (
            <Panel style={styles.section}>
              <SectionTitle style={styles.sectionTitleSm}>Flagged concerns</SectionTitle>
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
                  <Text style={[styles.concern, { color: colors.fgMuted }]}>{c.message}</Text>
                </View>
              ))}
            </Panel>
          ) : null}

          {product.similar_products?.length ? (
            <PdpSwaps title="Similar picks" swaps={product.similar_products} />
          ) : null}

          <Pressable
            style={[styles.basketCta, { backgroundColor: colors.fg }]}
            onPress={() => basket.add(product.slug, product.name)}
          >
            <Text style={[styles.basketCtaText, { color: colors.bg }]}>
              {basket.has(product.slug) ? "In your basket" : "Add to basket"}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function ChipsRow({ chips, colors }: { chips: string[]; colors: ThemeColors }) {
  return (
    <View style={chipStyles.row}>
      {chips.slice(0, 8).map((chip) => {
        const label = CHIP_LABELS[chip] ?? chip.replace(/_/g, " ");
        const good = CHIP_GOOD.has(chip);
        const bad = CHIP_BAD.has(chip);
        const bg = good
          ? `${colors.good}22`
          : bad
            ? `${colors.bad}22`
            : `${colors.warn}22`;
        const border = good ? `${colors.good}66` : bad ? `${colors.bad}55` : `${colors.warn}66`;
        const text = good ? colors.good : bad ? colors.bad : colors.warn;
        return (
          <View key={chip} style={[chipStyles.chip, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[chipStyles.text, { color: text }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SubscoreBar({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: ThemeColors;
}) {
  return (
    <View style={subStyles.row}>
      <Text style={[subStyles.label, { color: colors.fgMuted }]}>{label}</Text>
      <View style={[subStyles.track, { backgroundColor: colors.panel2 }]}>
        <View
          style={[subStyles.fill, { width: `${Math.min(100, value)}%`, backgroundColor: colors.accent }]}
        />
      </View>
      <Text style={[subStyles.val, { color: colors.fg }]}>{Math.round(value)}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
});

const subStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  label: { fontFamily: fonts.sans, width: 72, fontSize: 13 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  val: { fontFamily: fonts.sansSemiBold, width: 28, textAlign: "right" },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    nav: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    navRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    scroll: { paddingBottom: spacing.xxl * 2 },
    gallery: {
      marginHorizontal: spacing.lg,
      aspectRatio: 1,
      borderRadius: radius.xxl,
      borderWidth: 1,
      overflow: "hidden",
    },
    galleryImage: { width: SCREEN_W - spacing.lg * 2, height: SCREEN_W - spacing.lg * 2 },
    galleryEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
    dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: 10 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    brandEyebrow: {
      fontFamily: fonts.sansMedium,
      fontSize: 10,
      letterSpacing: 1.4,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    name: {
      fontFamily: fonts.display,
      fontSize: 28,
      lineHeight: 32,
      paddingHorizontal: spacing.lg,
      marginTop: 4,
    },
    whyBox: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      borderLeftWidth: 2,
    },
    whyLabel: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 3,
    },
    why: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
    price: {
      fontFamily: fonts.sansBold,
      fontSize: 24,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
    },
    mrp: {
      fontFamily: fonts.sans,
      fontSize: 14,
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
    verdictDesc: { fontFamily: fonts.sans, marginTop: 4, fontSize: 14 },
    section: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
    sectionTitleSm: { fontSize: 20, marginBottom: spacing.sm },
    ingredients: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22 },
    concernRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
      alignItems: "flex-start",
    },
    concernDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    concern: { flex: 1, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
    basketCta: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.xl,
      paddingVertical: 16,
      borderRadius: radius.xl,
      alignItems: "center",
    },
    basketCtaText: { fontFamily: fonts.sansBold, fontSize: 16 },
    error: { fontFamily: fonts.sans, color: colors.bad, padding: spacing.lg },
  });
}
