import { StyleSheet, Text, View } from "react-native";
import { catalogTierFill } from "@/lib/score";
import { resolveVerdict } from "@/lib/verdict";
import { fonts } from "@/theme";
import type { CatalogProduct, VerdictId } from "@/types/api";

export function ScoreBadge({
  score,
  product,
  label,
  match,
  size = "md",
}: {
  score?: number | null;
  product?: CatalogProduct;
  label?: string;
  match?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  if (score == null) return null;
  const verdict = product
    ? ((product as { verdict_resolved?: VerdictId | null }).verdict_resolved ?? resolveVerdict(product))
    : null;
  const fill = catalogTierFill(score, verdict);

  return (
    <View style={[
      styles.badge,
      { backgroundColor: fill },
      size === "lg" && styles.badgeLg,
      size === "sm" && styles.badgeSm,
    ]}>
      <Text style={[styles.score, size === "lg" && styles.scoreLg, size === "sm" && styles.scoreSm]}>
        {Math.round(score)}
      </Text>
      {(label || match) && size !== "lg" ? (
        <Text style={styles.sub}>{match ? "match" : label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 46,
    minHeight: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  badgeLg: { minWidth: 64, minHeight: 64, borderRadius: 14, paddingHorizontal: 10 },
  badgeSm: { minWidth: 34, minHeight: 34, borderRadius: 8, paddingHorizontal: 4 },
  score: { fontFamily: fonts.display, color: "#fff", fontSize: 22, lineHeight: 24 },
  scoreLg: { fontSize: 32, lineHeight: 34 },
  scoreSm: { fontSize: 14, lineHeight: 16 },
  sub: {
    fontSize: 8,
    fontFamily: fonts.sansBold,
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
  },
});
