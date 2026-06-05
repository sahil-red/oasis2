import { StyleSheet, Text, View } from "react-native";
import { Panel } from "@/components/ui/Panel";
import { Eyebrow } from "@/components/ui/Typography";
import { useTheme } from "@/lib/theme-context";
import { fonts, radius, spacing } from "@/theme";
import type { ScoreWhy } from "@/types/api";

function isPositive(line: string) {
  return /low sugar|no added|zero trans|good protein|decent fibre|decent fiber|clean ingredients|no flagged|works well|fine to keep/i.test(
    line,
  );
}

function bucket(explanation: ScoreWhy, deepseekWhy?: string | null) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of [deepseekWhy, ...explanation.reasons, ...explanation.tradeoffs]) {
    if (typeof line !== "string") continue;
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    lines.push(t);
  }
  const good: string[] = [];
  const watch: string[] = [];
  for (const line of lines) {
    if (isPositive(line)) good.push(line);
    else watch.push(line);
  }
  return {
    good: good.slice(0, 2),
    watch: watch.slice(0, 4),
  };
}

export function PdpScoreWhy({
  explanation,
  deepseekWhy,
}: {
  explanation: ScoreWhy | null | undefined;
  deepseekWhy?: string | null;
}) {
  const { colors } = useTheme();
  if (!explanation && !deepseekWhy) return null;

  const { good, watch } = explanation
    ? bucket(explanation, deepseekWhy)
    : { good: deepseekWhy ? [deepseekWhy] : [], watch: [] as string[] };

  if (!good.length && !watch.length) return null;

  return (
    <Panel style={styles.panel}>
      <Eyebrow>Why this score</Eyebrow>
      {good.map((line) => (
        <View key={line} style={styles.lineRow}>
          <View style={[styles.dot, { backgroundColor: colors.good }]} />
          <Text style={[styles.line, { color: colors.fg }]}>{line}</Text>
        </View>
      ))}
      {watch.map((line) => (
        <View key={line} style={styles.lineRow}>
          <View style={[styles.dot, { backgroundColor: colors.warn }]} />
          <Text style={[styles.line, { color: colors.fgMuted }]}>{line}</Text>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  lineRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  line: { flex: 1, fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
});
