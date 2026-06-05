import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ScoreBadge } from "@/components/ScoreBadge";
import { useTheme } from "@/lib/theme-context";
import { formatPrice } from "@/lib/verdict";
import { fonts, radius, spacing } from "@/theme";
import type { BasketSwap, CatalogProduct } from "@/types/api";

export function BasketCartLine({
  product,
  qty,
  swaps,
  swapsLoading,
  onDecrement,
  onIncrement,
  onRemove,
  onSwap,
}: {
  product: CatalogProduct;
  qty: number;
  swaps: BasketSwap[];
  swapsLoading: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
  onSwap: (swap: BasketSwap) => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [swapsOpen, setSwapsOpen] = useState(swaps.length > 0);
  const [replacing, setReplacing] = useState<string | null>(null);
  const linePrice =
    product.price_inr != null ? `₹${Math.round(product.price_inr * qty)}` : formatPrice(product);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.line }]}>
      <View style={styles.row}>
        <Pressable onPress={() => router.push(`/product/${product.slug}`)}>
          {product.image_urls[0] ? (
            <Image
              source={{ uri: product.image_urls[0] }}
              style={[styles.thumb, { backgroundColor: colors.bgSoft, borderColor: colors.line }]}
              contentFit="contain"
            />
          ) : (
            <View
              style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.bgSoft, borderColor: colors.line }]}
            />
          )}
        </Pressable>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Pressable style={styles.titlePress} onPress={() => router.push(`/product/${product.slug}`)}>
              <Text style={[styles.name, { color: colors.fg }]} numberOfLines={2}>
                {product.name}
              </Text>
            </Pressable>
            <ScoreBadge score={product.core_scores?.score} product={product} />
          </View>

          <Text style={[styles.price, { color: colors.fg }]}>{linePrice}</Text>

          <View style={styles.qtyRow}>
            <View style={[styles.qtyBox, { borderColor: colors.line, backgroundColor: colors.bgSoft }]}>
              <Pressable onPress={onDecrement} hitSlop={8} style={styles.qtyBtn}>
                <Ionicons name="remove" size={16} color={colors.fgMuted} />
              </Pressable>
              <Text style={[styles.qty, { color: colors.fg }]}>{qty}</Text>
              <Pressable
                onPress={onIncrement}
                hitSlop={8}
                style={[styles.qtyBtn, { backgroundColor: colors.fg }]}
              >
                <Ionicons name="add" size={16} color={colors.bg} />
              </Pressable>
            </View>
            <Pressable onPress={onRemove} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.fgDim} />
            </Pressable>
          </View>
        </View>
      </View>

      {swapsLoading ? (
        <ActivityIndicator color={colors.accent} style={styles.swapLoader} />
      ) : swaps.length > 0 ? (
        <View style={styles.swapSection}>
          <Pressable onPress={() => setSwapsOpen((v) => !v)} style={styles.swapHeader}>
            <Ionicons
              name={swapsOpen ? "chevron-down" : "chevron-forward"}
              size={14}
              color={colors.fgDim}
            />
            <Text style={[styles.swapHeaderText, { color: colors.fgMuted }]}>
              {swaps.length} better swap{swaps.length === 1 ? "" : "s"} in{" "}
              {product.subcategory ?? product.category ?? "this aisle"}
            </Text>
          </Pressable>
          {swapsOpen
            ? swaps.map((swap) => (
                <View
                  key={swap.slug}
                  style={[styles.swapRow, { backgroundColor: colors.bgSoft, borderColor: colors.line }]}
                >
                  <Pressable
                    style={styles.swapMain}
                    onPress={() => router.push(`/product/${swap.slug}`)}
                  >
                    {swap.image_urls[0] ? (
                      <Image
                        source={{ uri: swap.image_urls[0] }}
                        style={styles.swapThumb}
                        contentFit="contain"
                      />
                    ) : null}
                    <View style={styles.swapBody}>
                      <Text style={[styles.swapName, { color: colors.fg }]} numberOfLines={1}>
                        {swap.name}
                      </Text>
                      <Text style={[styles.swapMeta, { color: colors.fgMuted }]} numberOfLines={2}>
                        {swap.deltas.length > 0
                          ? swap.deltas.join(" · ")
                          : "Stronger same-aisle pick"}
                        {swap.price_inr != null ? ` · ₹${swap.price_inr}` : ""}
                      </Text>
                    </View>
                    {swap.core_scores?.score != null ? (
                      <Text style={[styles.swapScore, { color: colors.good }]}>
                        {Math.round(swap.core_scores.score)}
                      </Text>
                    ) : null}
                  </Pressable>
                  <Pressable
                    disabled={replacing === swap.slug}
                    onPress={() => {
                      setReplacing(swap.slug);
                      onSwap(swap);
                      setTimeout(() => setReplacing(null), 400);
                    }}
                    style={[styles.swapBtn, { borderColor: colors.line, backgroundColor: colors.panel }]}
                  >
                    <Ionicons name="swap-horizontal" size={14} color={colors.fg} />
                    <Text style={[styles.swapBtnText, { color: colors.fg }]}>
                      {replacing === swap.slug ? "…" : "Swap"}
                    </Text>
                  </Pressable>
                </View>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", gap: spacing.md },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  thumbEmpty: {},
  body: { flex: 1 },
  titleRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  titlePress: { flex: 1 },
  name: { fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 19 },
  price: { fontFamily: fonts.sansBold, fontSize: 15, marginTop: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.full,
    padding: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    minWidth: 24,
    textAlign: "center",
  },
  swapLoader: { marginTop: spacing.sm },
  swapSection: { marginTop: spacing.sm },
  swapHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  swapHeaderText: { fontFamily: fonts.sans, fontSize: 12 },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  swapMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  swapThumb: { width: 44, height: 44, borderRadius: radius.sm },
  swapBody: { flex: 1 },
  swapName: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  swapMeta: { fontFamily: fonts.sans, fontSize: 11, marginTop: 2, lineHeight: 15 },
  swapScore: { fontFamily: fonts.sansBold, fontSize: 16 },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  swapBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
});
