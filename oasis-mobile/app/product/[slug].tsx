import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { darkColors as colors } from "@/theme";
import Animated from "react-native-reanimated";
import { PdpIngredients } from "@/components/pdp/PdpIngredients";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { PressableScale } from "@/components/motion/PressableScale";
import { Screen } from "@/components/Screen";
import { Hairline } from "@/components/ui/Hairline";
import { fetchProduct } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { useTheme } from "@/lib/theme-context";
import { bandFromScore, labelForBand } from "@/lib/score";
import { VERDICT_COLORS, VERDICT_SHORT, formatPrice, resolveVerdict } from "@/lib/verdict";
import { fonts, radius, spacing } from "@/theme";
import { motion } from "@/theme/motion";
import type { PdpSwap, ProductDetail, VerdictId } from "@/types/api";
import { Ionicons } from "@expo/vector-icons";

const AnimatedText = Animated.createAnimatedComponent(Text);

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Chip system ──────────────────────────────────────────────────────────────
const CHIP_LABELS: Record<string, string> = {
  high_protein: "High Protein", low_sugar: "Low Sugar", no_added_sugar: "No Added Sugar",
  high_fiber: "High Fiber", gluten_free: "Gluten Free", vegan: "Vegan",
  high_sugar: "High Sugar", hidden_sweetener: "Hidden Sweetener",
  artificial_colors: "Artificial Colours", ultra_processed: "Ultra Processed",
  contains_preservatives: "Preservatives", high_sodium: "High Sodium",
  high_saturated_fat: "High Sat Fat", high_gi: "High GI", contains_nuts: "Contains Nuts",
};
const CHIP_GOOD = new Set(["high_protein","low_sugar","no_added_sugar","high_fiber","gluten_free","vegan"]);
const CHIP_BAD = new Set(["high_sugar","hidden_sweetener","ultra_processed"]);

function chipStyle(chip: string) {
  if (CHIP_GOOD.has(chip)) return { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.4)", text: "#34d399" };
  if (CHIP_BAD.has(chip)) return { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.35)", text: "#f87171" };
  return { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)", text: "#fbbf24" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text.toUpperCase()}</Text>;
}

function Divider() {
  return <Hairline style={styles.divider} />;
}

function SwapCard({ swap, onPress }: { swap: PdpSwap; onPress: () => void }) {
  const delta = swap.score != null ? null : null;
  const scoreDiff = swap.score != null ? Math.round(swap.goal_fit ?? 0) : null;
  return (
    <Pressable style={styles.swapCard} onPress={onPress}>
      <View style={styles.swapImageWrap}>
        {swap.image ? (
          <Image source={{ uri: swap.image }} style={styles.swapImage} contentFit="contain" />
        ) : (
          <View style={[styles.swapImage, { backgroundColor: colors.bgSoft }]} />
        )}
      </View>
      {swap.score != null && (
        <View style={styles.swapScoreBadge}>
          <Text style={styles.swapScoreText}>{swap.score}</Text>
        </View>
      )}
      {swap.brand ? (
        <Text style={styles.swapBrand} numberOfLines={1}>{swap.brand.toUpperCase()}</Text>
      ) : null}
      <Text style={styles.swapName} numberOfLines={2}>{swap.name}</Text>
      {swap.deltas?.[0] ? (
        <Text style={styles.swapDelta} numberOfLines={1}>{swap.deltas[0]}</Text>
      ) : null}
      {swap.price_inr != null ? (
        <Text style={styles.swapPrice}>₹{swap.price_inr}</Text>
      ) : null}
    </Pressable>
  );
}

function NutritionRow({ label, value, unit, emphasis, indent, warn, good }: {
  label: string; value?: number; unit?: string;
  emphasis?: boolean; indent?: boolean; warn?: boolean; good?: boolean;
}) {
  if (value == null) return null;
  const textColor = warn ? "#f87171" : good ? "#34d399" : colors.fg;
  return (
    <View style={[styles.nutRow, emphasis && styles.nutRowEmphasis]}>
      <Text style={[styles.nutLabel, indent && styles.nutLabelIndent, { color: colors.fgMuted }]}>
        {label}
      </Text>
      <Text style={[styles.nutValue, emphasis && styles.nutValueEmphasis, { color: textColor }]}>
        {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
        {unit ? <Text style={styles.nutUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

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

  const { colors, isDark } = useTheme();
  const verdict = (product?.verdict_resolved as VerdictId | null) ?? (product ? resolveVerdict(product) : null);
  const vc = verdict ? VERDICT_COLORS[verdict] : null;
  const core = product?.core_scores;

  // Animated score count-up using setState + setInterval (no Reanimated in JSX)
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    const target = core?.score ?? 0;
    if (target === 0) return;
    const steps = 20;
    const stepMs = 600 / steps;
    let current = 0;
    const id = setInterval(() => {
      current += 1;
      setDisplayScore(Math.round((target * current) / steps));
      if (current >= steps) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
  }, [core?.score]);
  const images = product?.image_urls?.length ? product.image_urls : [];
  const n = product?.nutrition;
  const chips = product?.deepseek_chips ?? (core?.verdict_sublabels ?? []);
  const why = product?.deepseek_why ?? product?.score_why ?? null;
  const swaps = product?.swaps ?? [];
  const similar = product?.similar_products ?? [];
  const ingredients = product?.ingredient_items ?? [];
  const inBasket = product ? basket.has(product.slug) : false;
  const zeptoBuyUrl = product?.zepto_buy_url ?? null;

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.fg} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </Screen>
    );
  }

  if (error || !product) {
    return (
      <Screen edges={["top"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.fg} />
          </Pressable>
        </View>
        <Text style={styles.errorText}>{error ?? "Product not found"}</Text>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Nav */}
      <View style={styles.nav}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.navBtn}
        >
          <Ionicons name="arrow-back" size={22} color={colors.fg} />
        </Pressable>
        <Pressable
          hitSlop={12}
          style={[styles.navBtn, inBasket && styles.navBtnActive]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            basket.add(product.slug, product.name);
          }}
        >
          <Ionicons
            name={inBasket ? "checkmark" : "bag-add-outline"}
            size={22}
            color={inBasket ? colors.good : colors.fg}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Gallery */}
        <View style={styles.gallery}>
          <FlatList
            data={images.length ? images : [null]}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            onMomentumScrollEnd={(e) => {
              setImageIndex(Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - spacing.lg * 2)));
            }}
            renderItem={({ item }) =>
              item ? (
                <Image source={{ uri: item }} style={styles.galleryImage} contentFit="contain" />
              ) : (
                <View style={[styles.galleryImage, { alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="image-outline" size={48} color={colors.fgDim} />
                </View>
              )
            }
          />
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* Header */}
        <View style={styles.header}>
          {product.brand ? (
            <Text style={styles.brand}>{product.brand.toUpperCase()}</Text>
          ) : null}
          <Text style={styles.name}>{product.name}</Text>
          {product.subcategory ? (
            <Text style={styles.meta}>{[product.category, product.subcategory].filter(Boolean).join(" · ")}</Text>
          ) : null}

          {/* Chips */}
          {chips.length > 0 && (
            <View style={styles.chipsRow}>
              {chips.slice(0, 5).map((chip) => {
                const label = CHIP_LABELS[chip] ?? chip.replace(/_/g, " ");
                const s = chipStyle(chip);
                return (
                  <View key={chip} style={[styles.chip, { backgroundColor: s.bg, borderColor: s.border }]}>
                    <Text style={[styles.chipText, { color: s.text }]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Verdict card */}
        {verdict && vc && core ? (
          <View style={styles.verdictCard}>
            <LinearGradient
              colors={[vc.bg + "CC", "transparent"]}
              style={styles.verdictGradient}
            >
              <View style={styles.verdictTop}>
                <View>
                  <Text style={[styles.verdictLabel, { color: vc.fg }]}>
                    {VERDICT_SHORT[verdict]}
                  </Text>
                  {core.grade ? (
                    <View style={[styles.gradeBadge, { borderColor: vc.fg + "44" }]}>
                      <Text style={[styles.gradeText, { color: vc.fg }]}>Grade {core.grade}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.bigScore}>
                  <Text style={[styles.bigScoreNum, { color: vc.fg }]}>
                    {displayScore}
                  </Text>
                  <Text style={[styles.bigScoreDenom, { color: colors.fgDim }]}>/100</Text>
                </View>
              </View>
              {typeof why === "string" && why ? (
                <Text style={styles.whyText}>{why}</Text>
              ) : null}
            </LinearGradient>
          </View>
        ) : null}

        {/* Price */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(product)}</Text>
          {product.mrp_inr && product.price_inr && product.mrp_inr > product.price_inr ? (
            <Text style={styles.mrp}>MRP ₹{Math.round(product.mrp_inr)}</Text>
          ) : null}
        </View>

        {zeptoBuyUrl ? (
          <PressableScale
            haptic="light"
            onPress={() => void Linking.openURL(zeptoBuyUrl)}
            style={styles.zeptoInlineBtn}
          >
            <Text style={[styles.zeptoInlineText, { color: colors.accent }]}>Buy on Zepto</Text>
            <Ionicons name="open-outline" size={16} color={colors.accent} />
          </PressableScale>
        ) : null}

        {/* Score breakdown */}
        {core?.subscores ? (
          <>
            <Divider />
            <View style={styles.section}>
              <SectionLabel text="Score breakdown" />
              <SubscoreBar label="Nutrition" value={core.subscores.nutrition} />
              <SubscoreBar label="Additives" value={core.subscores.additives} />
              <SubscoreBar label="Labels" value={core.subscores.labels} />
            </View>
          </>
        ) : null}

        {/* Better alternatives (swaps) */}
        {swaps.length > 0 ? (
          <>
            <Divider />
            <View style={styles.section}>
              <SectionLabel text="Better alternatives" />
              <Text style={styles.sectionSub}>Products that score higher with similar purpose</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRail}>
                {swaps.map((s) => (
                  <SwapCard key={s.slug} swap={s} onPress={() => router.push(`/product/${s.slug}`)} />
                ))}
              </ScrollView>
            </View>
          </>
        ) : null}

        {/* Ingredients — parsed server-side via same lib as web */}
        {ingredients.length > 0 || product.ingredients_raw ? (
          <PdpIngredients items={ingredients} rawLabel={product.ingredients_raw} />
        ) : null}

        {/* Nutrition */}
        {n ? (
          <>
            <Divider />
            <View style={styles.section}>
              <SectionLabel text="Nutrition per 100g" />
              <View style={styles.nutritionTable}>
                <NutritionRow label="Energy" value={n.energy_kcal_100g} unit="kcal" emphasis />
                <NutritionRow label="Total Fat" value={n.fat_g_100g} unit="g" emphasis
                  warn={n.fat_g_100g != null && n.fat_g_100g > 20} />
                <NutritionRow label="Carbohydrate" value={(n as any).carbs_g_100g} unit="g" emphasis />
                <NutritionRow label="  of which sugar" value={n.sugar_g_100g} unit="g" indent
                  warn={n.sugar_g_100g != null && n.sugar_g_100g > 10} />
                {n.added_sugar_g_100g != null ? (
                  <NutritionRow label="  added sugar" value={n.added_sugar_g_100g} unit="g" indent
                    warn={n.added_sugar_g_100g > 5} />
                ) : null}
                <NutritionRow label="Protein" value={n.protein_g_100g} unit="g" emphasis
                  good={n.protein_g_100g != null && n.protein_g_100g >= 15} />
                <NutritionRow label="Dietary Fiber" value={n.fiber_g_100g} unit="g"
                  good={n.fiber_g_100g != null && n.fiber_g_100g >= 5} />
                <NutritionRow label="Sodium" value={n.sodium_mg_100g} unit="mg"
                  warn={n.sodium_mg_100g != null && n.sodium_mg_100g > 600} />
              </View>
            </View>
          </>
        ) : null}

        {/* Concerns */}
        {core?.concerns?.length ? (
          <>
            <Divider />
            <View style={styles.section}>
              <SectionLabel text="Why Scout flagged this" />
              {core.concerns.map((c, i) => (
                <View key={i} style={styles.concernRow}>
                  <View style={[styles.concernDot, {
                    backgroundColor: c.severity === "high" ? colors.bad
                      : c.severity === "medium" ? colors.warn : colors.fgDim,
                  }]} />
                  <Text style={styles.concernText}>{c.message}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* More like this */}
        {similar.length > 0 ? (
          <>
            <Divider />
            <View style={styles.section}>
              <SectionLabel text="More like this" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRail}>
                {similar.map((s) => (
                  <SwapCard key={s.slug} swap={s} onPress={() => router.push(`/product/${s.slug}`)} />
                ))}
              </ScrollView>
            </View>
          </>
        ) : null}

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>

      {/* Sticky glass CTA */}
      <BlurView
        tint={isDark ? "dark" : "light"}
        intensity={50}
        style={[styles.ctaBar, { borderTopColor: colors.line }]}
      >
        <View style={[StyleSheet.absoluteFillObject, {
          backgroundColor: isDark ? "rgba(10,10,11,0.72)" : "rgba(250,247,242,0.72)",
        }]} />
        <View style={styles.ctaRow}>
          {zeptoBuyUrl ? (
            <PressableScale
              haptic="light"
              onPress={() => void Linking.openURL(zeptoBuyUrl)}
              style={styles.ctaZeptoPressable}
            >
              <View style={[styles.ctaZepto, { borderColor: colors.line, backgroundColor: colors.panel }]}>
                <Ionicons name="cart-outline" size={18} color={colors.fg} />
                <Text style={[styles.ctaZeptoText, { color: colors.fg }]}>Zepto</Text>
                <Ionicons name="open-outline" size={14} color={colors.fgDim} />
              </View>
            </PressableScale>
          ) : null}
          <PressableScale
            haptic="medium"
            onPress={() => { basket.add(product.slug, product.name); }}
            style={
              zeptoBuyUrl
                ? ([styles.ctaPressable, styles.ctaPressableSplit] as ViewStyle[])
                : styles.ctaPressable
            }
          >
            <View style={[styles.cta, { backgroundColor: inBasket ? "transparent" : colors.fg },
              inBasket && { borderWidth: 1.5, borderColor: colors.good }]}>
              <Ionicons
                name={inBasket ? "checkmark-circle" : "bag-add"}
                size={20}
                color={inBasket ? colors.good : colors.bg}
              />
              <Text style={[styles.ctaText, { color: inBasket ? colors.good : colors.bg }]}>
                {inBasket ? "In basket" : "Add to basket"}
              </Text>
            </View>
          </PressableScale>
        </View>
      </BlurView>
    </Screen>
  );
}

function SubscoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct >= 70 ? "#34d399" : pct >= 45 ? "#fbbf24" : "#f87171";
  return (
    <View style={styles.subscoreRow}>
      <Text style={styles.subscoreLabel}>{label}</Text>
      <View style={styles.subscoreTrack}>
        <View style={[styles.subscoreFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.subscoreVal, { color: barColor }]}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnActive: { borderColor: colors.good },
  scroll: { paddingBottom: 100 },
  errorText: { fontFamily: fonts.sans, color: colors.bad, padding: spacing.lg, fontSize: 15 },

  // Gallery
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
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.fg, width: 18 },

  // Header
  header: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  brand: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1.4, color: colors.fgDim },
  name: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: colors.fg, marginTop: 4 },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim, marginTop: 4 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: fonts.sansSemiBold, fontSize: 11 },

  // Verdict card
  verdictCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  verdictGradient: { padding: spacing.md },
  verdictTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  verdictLabel: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  gradeBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  gradeText: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
  bigScore: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  bigScoreNum: { fontFamily: fonts.display, fontSize: 52, lineHeight: 56 },
  bigScoreDenom: { fontFamily: fonts.sans, fontSize: 16, color: colors.fgDim },
  whyText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.fgMuted,
    lineHeight: 20,
    marginTop: spacing.sm,
  },

  // Price
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  price: { fontFamily: fonts.sansBold, fontSize: 26, color: colors.fg },
  mrp: { fontFamily: fonts.sans, fontSize: 14, color: colors.fgDim, textDecorationLine: "line-through" },

  // Divider + sections
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.lg, marginHorizontal: spacing.lg },
  section: { paddingHorizontal: spacing.lg },
  sectionLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.fgDim,
    marginBottom: spacing.sm,
  },
  sectionSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim, marginBottom: spacing.sm },

  // Score bars
  subscoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  subscoreLabel: { fontFamily: fonts.sans, width: 76, fontSize: 13, color: colors.fgMuted },
  subscoreTrack: { flex: 1, height: 6, backgroundColor: colors.panel2, borderRadius: 3, overflow: "hidden" },
  subscoreFill: { height: "100%", borderRadius: 3 },
  subscoreVal: { fontFamily: fonts.sansSemiBold, width: 30, textAlign: "right", fontSize: 13 },

  // Swaps / similar
  horizontalRail: { gap: spacing.md, paddingVertical: spacing.xs },
  swapCard: { width: 140, backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: spacing.sm },
  swapImageWrap: { aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.bgSoft, overflow: "hidden", position: "relative" },
  swapImage: { width: "100%", height: "100%", padding: 6 },
  swapScoreBadge: {
    position: "absolute",
    top: 6, right: 6,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  swapScoreText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.fg },
  swapBrand: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1, color: colors.fgDim, marginTop: 8 },
  swapName: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.fg, marginTop: 2, lineHeight: 16, minHeight: 30 },
  swapDelta: { fontFamily: fonts.sans, fontSize: 11, color: "#34d399", marginTop: 4 },
  swapPrice: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.fg, marginTop: 3 },

  // Ingredients
  ingredientsList: { gap: 2 },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  riskDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  ingredientBody: { flex: 1 },
  ingredientNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  ingredientName: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.fgMuted, lineHeight: 18 },
  eNumber: { fontFamily: fonts.sansMedium, color: colors.fgDim },
  ingredientPct: { fontFamily: fonts.sansMedium, color: colors.fgDim },
  tierLabel: { fontFamily: fonts.sansSemiBold, fontSize: 10, textAlign: "right" },
  ingredientWhy: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgMuted, marginTop: 4, lineHeight: 17 },
  rawIngredients: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, lineHeight: 22 },

  // Nutrition
  nutritionTable: { gap: 2 },
  nutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.md,
  },
  nutRowEmphasis: { borderBottomWidth: 1, borderBottomColor: colors.line },
  nutLabel: { fontFamily: fonts.sans, fontSize: 14, flex: 1 },
  nutLabelIndent: { paddingLeft: 12, fontSize: 13 },
  nutValue: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  nutValueEmphasis: { fontFamily: fonts.sansBold, fontSize: 16 },
  nutUnit: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim },

  // Concerns
  concernRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm, alignItems: "flex-start" },
  concernDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  concernText: { flex: 1, fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, lineHeight: 20 },

  // CTA bar (glass)
  ctaBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  ctaRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  ctaPressable: { flex: 1 },
  ctaPressableSplit: { flex: 1.4 },
  ctaZeptoPressable: { flex: 1 },
  ctaZepto: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaZeptoText: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  zeptoInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    alignSelf: "flex-start",
  },
  zeptoInlineText: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  cta: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 16,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaAdded: {},
  ctaText: { fontFamily: fonts.sansBold, fontSize: 16 },
});
