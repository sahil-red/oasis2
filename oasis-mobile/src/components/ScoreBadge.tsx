import { StyleSheet, Text, View } from "react-native";
import { colors, radius, typography } from "@/theme";

export function ScoreBadge({
  score,
  label,
}: {
  score?: number | null;
  label?: string;
}) {
  if (score == null) return null;
  const band =
    score >= 76 ? colors.scoreExcellent : score >= 51 ? colors.scoreGood : score >= 26 ? colors.scorePoor : colors.scoreBad;
  return (
    <View style={[styles.badge, { borderColor: band }]}>
      <Text style={[styles.score, { color: band }]}>{Math.round(score)}</Text>
      <Text style={styles.label}>{label ?? "MATCH"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 44,
  },
  score: {
    fontSize: 15,
    fontWeight: "700",
  },
  label: {
    ...typography.micro,
    color: colors.fgDim,
    fontSize: 8,
  },
});
