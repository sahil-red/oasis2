import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScoreBadge } from "@/components/ScoreBadge";
import { VerdictPill } from "@/components/VerdictPill";
import { useBasket } from "@/lib/basket";
import { formatPrice } from "@/lib/verdict";
import { colors, radius, spacing, typography } from "@/theme";
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
          <ScoreBadge score={displayScore} />
        </View>
      </View>
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
          style={styles.addBtn}
        >
          <Ionicons
            name={basket.has(product.slug) ? "checkmark-circle" : "add-circle"}
            size={28}
            color={basket.has(product.slug) ? colors.good : colors.accent}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: spacing.xs,
  },
  pressed: { opacity: 0.92 },
  imageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%", padding: spacing.sm },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.fgDim, fontSize: 12 },
  topLeft: { position: "absolute", left: 8, top: 8 },
  topRight: { position: "absolute", right: 8, top: 8 },
  name: {
    ...typography.caption,
    color: colors.fg,
    marginTop: spacing.sm,
    fontWeight: "600",
  },
  meta: { color: colors.fgMuted, fontSize: 12, marginTop: 2 },
  reason: { color: colors.accent, fontSize: 12, marginTop: 4 },
  warn: { color: colors.warn, fontSize: 11, marginTop: 2 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  price: { fontSize: 16, fontWeight: "700", color: colors.fg },
  addBtn: { padding: 4 },
});
