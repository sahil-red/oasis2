import { StyleSheet, Text, View } from "react-native";
import { catalogTierFill } from "@/lib/score";
import { resolveVerdict } from "@/lib/verdict";
import { colors, radius, typography } from "@/theme";
import type { CatalogProduct, VerdictId } from "@/types/api";

export function ScoreBadge({
  score,
  product,
  label,
  match,
}: {
  score?: number | null;
  product?: CatalogProduct;
  label?: string;
  match?: boolean;
}) {
  if (score == null) return null;
  const verdict = product
    ? ((product as { verdict_resolved?: VerdictId | null }).verdict_resolved ?? resolveVerdict(product))
    : null;
  const fill = catalogTierFill(score, verdict);

  return (
    <View style={[styles.badge, { backgroundColor: fill }]}>
      <Text style={styles.score}>{Math.round(score)}</Text>
      {label || match ? (
        <Text style={styles.label}>{match ? "match" : label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  score: {
    ...typography.score,
    color: "#fff",
    fontSize: 22,
    lineHeight: 24,
  },
  label: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
