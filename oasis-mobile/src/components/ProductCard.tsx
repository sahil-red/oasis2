import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScoreBadge } from "@/components/ScoreBadge";
import { VerdictPill } from "@/components/VerdictPill";
import { useBasket } from "@/lib/basket";
import { formatPrice } from "@/lib/verdict";
import { colors, fonts, radius, spacing } from "@/theme";
import type { CatalogProduct } from "@/types/api";
import { Ionicons } from "@expo/vector-icons";

// Maps chip ids to display labels
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
  artificial_flavors: "Artificial Flavours",
  contains_preservatives: "Preservatives",
  ultra_processed: "Ultra Processed",
  high_saturated_fat: "High Sat Fat",
  high_sodium: "High Sodium",
  high_gi: "High GI",
  contains_nuts: "Contains Nuts",
};

const CHIP_TONE: Record<string, "good" | "warn" | "bad"> = {
  high_protein: "good",
  low_sugar: "good",
  no_added_sugar: "good",
  high_fiber: "good",
  gluten_free: "good",
  vegan: "good",
  high_sugar: "bad",
  hidden_sweetener: "bad",
  artificial_colors: "warn",
  artificial_flavors: "warn",
  contains_preservatives: "warn",
  ultra_processed: "bad",
  high_saturated_fat: "warn",
  high_sodium: "warn",
  high_gi: "warn",
};

const TONE_COLORS = {
  good: { bg: "rgba(52, 211, 153, 0.12)", border: "rgba(52, 211, 153, 0.4)", text: "#34d399" },
  warn: { bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.4)", text: "#fbbf24" },
  bad: { bg: "rgba(248, 113, 113, 0.12)", border: "rgba(248, 113, 113, 0.35)", text: "#f87171" },
  neutral: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", text: colors.fgMuted },
};

function ChipRow({ chips }: { chips: string[] }) {
  const visible = chips.slice(0, 3);
  if (!visible.length) return null;
  return (
    <View style={chipStyles.row}>
      {visible.map((chip) => {
        const label = CHIP_LABELS[chip] ?? chip.replace(/_/g, " ");
        const tone = CHIP_TONE[chip] ?? "neutral";
        const c = TONE_COLORS[tone];
        return (
          <View key={chip} style={[chipStyles.chip, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={[chipStyles.chipText, { color: c.text }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 0.2 },
  // Search reason chips — subtler, neutral
  reasonChip: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.12)",
    maxWidth: 140,
  },
  reasonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: colors.fgMuted,
    letterSpacing: 0.1,
  },
});

export function ProductCard({
  product,
  aiReasons,
}: {
  product: CatalogProduct;
  aiReasons?: string[];
}) {
  const router = useRouter();
  const basket = useBasket();
  const thumb = product.image_urls[0];
  const displayScore = product.ai_match_score ?? product.core_scores?.score;
  const attributeChips = product.deepseek_chips ?? (product.core_scores?.verdict_sublabels ?? []);
  const why = product.deepseek_why;
  const reasons = aiReasons ?? product.ai_match_reasons ?? [];
  const isMatch = product.ai_match_score != null;
  const inBasket = basket.has(product.slug);

  // Show product attribute chips first (colored by health tone),
  // then search-match reasons as neutral chips — up to 4 total.
  // Filter out generic reasons that add no value.
  const searchReasonChips = reasons
    .filter((r) => !/^(Scout score|Closest|Matches your|catalog keyword)/i.test(r))
    .slice(0, 2);
  const attrChipsToShow = attributeChips.slice(0, Math.max(0, 3 - searchReasonChips.length));
  const allChips = attrChipsToShow.length + searchReasonChips.length > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/product/${product.slug}`)}
    >
      <View style={styles.imageWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.image} contentFit="contain" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No image</Text>
          </View>
        )}
        <View style={styles.topLeft}>
          <VerdictPill product={product} />
        </View>
        <View style={styles.topRight}>
          <ScoreBadge score={displayScore} product={product} match={isMatch} />
        </View>
      </View>

      <View style={styles.brandRow}>
        {product.brand ? (
          <Text style={styles.brand} numberOfLines={1}>{product.brand.toUpperCase()}</Text>
        ) : null}
        {product.scout_verified ? (
          <Text style={styles.verified}>Verified by Scout</Text>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>{product.name}</Text>

      {/* Combined chip row: product health attributes + search match reasons */}
      {allChips ? (
        <View style={chipStyles.row}>
          {/* Attribute chips — colored by health tone */}
          {attrChipsToShow.map((chip) => {
            const label = CHIP_LABELS[chip] ?? chip.replace(/_/g, " ");
            const tone = CHIP_TONE[chip] ?? "neutral";
            const c = TONE_COLORS[tone];
            return (
              <View key={chip} style={[chipStyles.chip, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Text style={[chipStyles.chipText, { color: c.text }]}>{label}</Text>
              </View>
            );
          })}
          {/* Search reason chips — neutral style */}
          {searchReasonChips.map((reason) => (
            <View key={reason} style={[chipStyles.chip, chipStyles.reasonChip]}>
              <Text style={chipStyles.reasonText} numberOfLines={1}>{reason}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* DeepSeek one-liner — only shown when there are no reasons and no chips */}
      {!allChips && !reasons.length && why ? (
        <Text style={styles.why} numberOfLines={2}>{why}</Text>
      ) : null}

      {product.ai_match_warning ? (
        <Text style={styles.warn} numberOfLines={1}>{product.ai_match_warning}</Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.price}>{formatPrice(product)}</Text>
        <Pressable
          hitSlop={12}
          onPress={(e) => {
            e.stopPropagation?.();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            basket.add(product.slug, product.name);
          }}
          style={[styles.addBtn, inBasket && styles.addBtnOn]}
        >
          <Ionicons
            name={inBasket ? "checkmark" : "add"}
            size={18}
            color={inBasket ? colors.good : colors.bg}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: spacing.xs },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.bgSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%", padding: spacing.sm },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.fgDim, fontSize: 12 },
  topLeft: { position: "absolute", left: 8, top: 8 },
  topRight: { position: "absolute", right: 7, top: 7 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  brand: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.fgDim,
    flexShrink: 1,
  },
  verified: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 0.4,
    color: colors.good,
    textTransform: "uppercase",
  },
  name: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.fg,
    marginTop: 3,
  },
  why: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.fgMuted,
    lineHeight: 15,
    marginTop: 5,
  },
  warn: { fontFamily: fonts.sans, color: colors.warn, fontSize: 11, marginTop: 3 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  price: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.fg },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.fg,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnOn: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.good },
});
