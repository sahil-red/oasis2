import { StyleSheet, Text, View } from "react-native";
import { VERDICT_COLORS, VERDICT_SHORT, resolveVerdict } from "@/lib/verdict";
import { typography } from "@/theme";
import type { CatalogProduct } from "@/types/api";

export function VerdictPill({ product }: { product: CatalogProduct }) {
  const verdict = resolveVerdict(product);
  if (!verdict) return null;
  const vc = VERDICT_COLORS[verdict];
  return (
    <View style={[styles.pill, { backgroundColor: vc.bg, borderColor: vc.border }]}>
      <Text style={[styles.text, { color: vc.fg }]}>{VERDICT_SHORT[verdict]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { ...typography.micro, fontSize: 10, letterSpacing: 0.2 },
});
