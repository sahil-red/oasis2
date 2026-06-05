import { LinearGradient } from "expo-linear-gradient";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/lib/theme-context";
import { radius, spacing } from "@/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** Single shimmer block. Compose these for screen-specific loaders. */
export function Skeleton({ width = "100%", height = 16, borderRadius = radius.md, style }: SkeletonProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(-300);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(300, { duration: 1200 }),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[
        styles.base,
        { width: width as number, height, borderRadius, backgroundColor: colors.bgSoft, overflow: "hidden" },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, shimmerStyle]}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.06)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}

/** Skeleton for a product card (square image + 2 text lines + price row). */
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton height={160} borderRadius={radius.xl} />
      <Skeleton height={10} width="60%" style={{ marginTop: spacing.sm }} />
      <Skeleton height={32} style={{ marginTop: 6 }} />
      <View style={styles.cardFooter}>
        <Skeleton height={18} width="40%" />
        <Skeleton height={30} width={30} borderRadius={radius.full} />
      </View>
    </View>
  );
}

/** Skeleton for a 2-column product grid. */
export function SkeletonGrid({ rows = 2 }: { rows?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: rows * 2 }).map((_, i) => (
        <SkeletonCard key={i} style={styles.gridItem} />
      ))}
    </View>
  );
}

/** Skeleton for a horizontal stats strip. */
export function SkeletonStats() {
  return (
    <View style={styles.stats}>
      <Skeleton height={56} borderRadius={radius.xl} style={{ flex: 1 }} />
      <Skeleton height={56} borderRadius={radius.xl} style={{ flex: 1 }} />
    </View>
  );
}

/** Skeleton for a section with eyebrow + title + card row. */
export function SkeletonSection() {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Skeleton height={10} width="30%" style={{ marginHorizontal: spacing.lg }} borderRadius={4} />
      <Skeleton height={26} width="65%" style={{ marginTop: 8, marginHorizontal: spacing.lg }} borderRadius={6} />
      <View style={styles.horizontalRow}>
        {[140, 140, 120].map((w, i) => (
          <Skeleton key={i} height={160} width={w} borderRadius={radius.xl} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
  card: { flex: 1, margin: spacing.xs },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: spacing.sm },
  gridItem: { width: "50%" },
  stats: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.xl },
  horizontalRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
});
