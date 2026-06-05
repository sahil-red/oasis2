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
  const reasons = aiReasons ?? product.ai_match_reasons;
  const isMatch = product.ai_match_score != null;

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
      {product.brand ? (
        <Text style={styles.brand} numberOfLines={1}>
          {product.brand.toUpperCase()}
        </Text>
      ) : null}
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      {product.subcategory ? (
        <Text style={styles.meta} numberOfLines={1}>
          {product.subcategory}
        </Text>
      ) : null}
      {reasons?.length ? (
        <Text style={styles.reason} numberOfLines={2}>
          {reasons[0]}
        </Text>
      ) : null}
      {product.ai_match_warning ? (
        <Text style={styles.warn} numberOfLines={1}>
          {product.ai_match_warning}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.price}>{formatPrice(product)}</Text>
        <Pressable
          hitSlop={12}
          onPress={(e) => {
            e.stopPropagation?.();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            basket.add(product.slug);
          }}
          style={[styles.addBtn, basket.has(product.slug) && styles.addBtnOn]}
        >
          <Ionicons
            name={basket.has(product.slug) ? "checkmark" : "add"}
            size={20}
            color={basket.has(product.slug) ? colors.good : colors.bg}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: spacing.xs },
  pressed: { opacity: 0.92, transform: [{ translateY: 1 }] },
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
  topLeft: { position: "absolute", left: 10, top: 10 },
  topRight: { position: "absolute", right: 8, top: 8 },
  brand: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.fgDim,
    marginTop: spacing.sm,
  },
  name: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.fg,
    marginTop: 4,
  },
  meta: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 12, marginTop: 2 },
  reason: { fontFamily: fonts.sans, color: colors.accent, fontSize: 12, marginTop: 4 },
  warn: { fontFamily: fonts.sans, color: colors.warn, fontSize: 11, marginTop: 2 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  price: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.fg },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.fg,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnOn: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.good },
});
