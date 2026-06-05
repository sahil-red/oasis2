import { StyleSheet, Text, View } from "react-native";
import { VERDICT_COLORS, VERDICT_SHORT, resolveVerdict } from "@/lib/verdict";
import { radius, typography } from "@/theme";
import type { CatalogProduct } from "@/types/api";

export function VerdictPill({ product }: { product: CatalogProduct }) {
  const verdict = resolveVerdict(product);
  if (!verdict) return null;
  const c = VERDICT_COLORS[verdict];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.text, { color: c.fg }]}>{VERDICT_SHORT[verdict]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    ...typography.micro,
    textTransform: "uppercase",
  },
});
