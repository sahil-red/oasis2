import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/Typography";
import { useTheme } from "@/lib/theme-context";
import { fonts, radius, spacing } from "@/theme";
import type { IngredientItem } from "@/types/api";
import { dotRiskForItem, isProbiotic, riskColors } from "./ingredient-colors";

const INITIAL = 20;

function riskRank(item: IngredientItem) {
  if (item.risk === "hazardous") return 4;
  if (item.risk === "moderate") return 3;
  if (item.risk === "limited") return 2;
  return 0;
}

function IngredientRow({ item }: { item: IngredientItem }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const risk = dotRiskForItem(item);
  const rc = riskColors(risk, colors);
  const probiotic = isProbiotic(item);

  return (
    <View style={[styles.row, { borderBottomColor: colors.line }]}>
      <Pressable
        onPress={() => item.why && setOpen((v) => !v)}
        disabled={!item.why}
        style={styles.rowBtn}
      >
        <View
          style={[styles.dot, { backgroundColor: probiotic ? "#14b8a6" : rc.dot }]}
        />
        <View style={styles.rowBody}>
          <Text style={[styles.name, { color: colors.fg }]}>{item.display}</Text>
          <View style={styles.meta}>
            {item.e_number ? (
              <Text style={[styles.metaText, { color: colors.fgDim }]}>{item.e_number}</Text>
            ) : null}
            {item.percent ? (
              <Text style={[styles.metaText, { color: colors.fgDim }]}>{item.percent}</Text>
            ) : null}
            <Text style={[styles.tier, { color: probiotic ? "#2dd4bf" : rc.text }]}>
              {item.tier_label}
            </Text>
          </View>
        </View>
      </Pressable>
      {open && item.why ? (
        <View style={[styles.whyBox, { backgroundColor: colors.bgSoft }]}>
          <Text style={[styles.why, { color: colors.fgMuted }]}>{item.why}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PdpIngredients({
  items,
  rawLabel,
}: {
  items: IngredientItem[];
  rawLabel?: string | null;
}) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const flagged = items.filter((i) => i.flagged).length;
  const hazardous = items.filter((i) => i.risk === "hazardous").length;
  const watchful = items.filter((i) => i.risk === "limited").length;

  const highestRisk = useMemo(() => {
    return [...items].sort((a, b) => riskRank(b) - riskRank(a))[0];
  }, [items]);

  if (!items.length && !rawLabel?.trim()) return null;

  const visible = showAll ? items : items.slice(0, INITIAL);
  const hiddenCount = Math.max(0, items.length - visible.length);
  const calloutRisk = highestRisk && riskRank(highestRisk) > 0 ? highestRisk : null;

  return (
    <Panel style={styles.panel}>
      <SectionTitle style={styles.title}>Ingredients</SectionTitle>
      <Text style={[styles.hint, { color: colors.fgMuted }]}>
        Tap flagged items for why behind the rating
      </Text>

      {items.length > 0 ? (
        <View style={styles.summaryRow}>
          <SummaryTile label="Listed" value={String(items.length)} colors={colors} />
          <SummaryTile
            label={hazardous > 0 ? "High risk" : "Flagged"}
            value={String(hazardous > 0 ? hazardous : flagged + watchful)}
            tone={flagged + hazardous + watchful === 0 ? "good" : hazardous > 0 ? "bad" : "watch"}
            colors={colors}
          />
        </View>
      ) : null}

      {calloutRisk ? (
        <View
          style={[
            styles.callout,
            {
              borderColor: `${hazardous > 0 ? colors.bad : colors.warn}55`,
              backgroundColor: `${hazardous > 0 ? colors.bad : colors.warn}12`,
            },
          ]}
        >
          <Text
            style={[
              styles.calloutEyebrow,
              { color: hazardous > 0 ? colors.bad : colors.warn },
            ]}
          >
            Ingredient to notice
          </Text>
          <Text style={[styles.calloutName, { color: colors.fg }]}>
            {calloutRisk.display}
            <Text style={{ color: hazardous > 0 ? colors.bad : colors.warn }}>
              {" "}
              {calloutRisk.tier_label}
            </Text>
          </Text>
          {calloutRisk.why ? (
            <Text style={[styles.calloutWhy, { color: colors.fgMuted }]} numberOfLines={3}>
              {calloutRisk.why.split(/(?<=[.!?])\s+/)[0]}
            </Text>
          ) : null}
        </View>
      ) : null}

      {visible.map((item, i) => (
        <IngredientRow key={`${item.display}-${item.percent ?? ""}-${i}`} item={item} />
      ))}

      {hiddenCount > 0 ? (
        <Pressable onPress={() => setShowAll(true)} style={styles.more}>
          <Text style={[styles.moreText, { color: colors.accent }]}>
            Show {hiddenCount} more ingredient{hiddenCount !== 1 ? "s" : ""}
          </Text>
        </Pressable>
      ) : showAll && items.length > INITIAL ? (
        <Pressable onPress={() => setShowAll(false)} style={styles.more}>
          <Text style={[styles.moreText, { color: colors.accent }]}>Collapse ingredient list</Text>
        </Pressable>
      ) : null}

      {rawLabel?.trim() ? (
        <>
          <Pressable onPress={() => setShowRaw((v) => !v)} style={styles.rawToggle}>
            <Text style={[styles.rawToggleText, { color: colors.fgDim }]}>
              {showRaw ? "Hide" : "Show"} full label text
            </Text>
          </Pressable>
          {showRaw ? (
            <Text style={[styles.raw, { color: colors.fgMuted, borderColor: colors.line }]}>
              {rawLabel}
            </Text>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
  colors,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "watch" | "bad";
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const valueColor =
    tone === "good"
      ? colors.good
      : tone === "watch"
        ? colors.warn
        : tone === "bad"
          ? colors.bad
          : colors.fg;
  return (
    <View style={[styles.summaryTile, { borderColor: colors.line, backgroundColor: colors.panel2 }]}>
      <Text style={[styles.summaryLabel, { color: colors.fgDim }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  title: { fontSize: 20, marginBottom: 4 },
  hint: { fontFamily: fonts.sans, fontSize: 12, marginBottom: spacing.sm },
  summaryRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  summaryTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  summaryLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summaryValue: { fontFamily: fonts.display, fontSize: 24, marginTop: 4 },
  callout: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  calloutEyebrow: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  calloutName: { fontFamily: fonts.sansSemiBold, fontSize: 14, marginTop: 4 },
  calloutWhy: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowBtn: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  rowBody: { flex: 1 },
  name: { fontFamily: fonts.sansMedium, fontSize: 14 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  metaText: { fontFamily: fonts.sans, fontSize: 11 },
  tier: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
  whyBox: { padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm },
  why: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  more: { paddingTop: spacing.sm },
  moreText: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  rawToggle: { marginTop: spacing.md },
  rawToggleText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    textDecorationLine: "underline",
  },
  raw: {
    marginTop: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
});
