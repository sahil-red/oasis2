import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/Typography";
import { useTheme } from "@/lib/theme-context";
import { fonts, radius, spacing } from "@/theme";
import type { IngredientItem } from "@/types/api";
import { dotRiskForItem, isProbiotic, riskColors } from "./ingredient-colors";

const INITIAL = 12;

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
          style={[
            styles.dot,
            { backgroundColor: probiotic ? "#14b8a6" : rc.dot },
          ]}
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

export function PdpIngredients({ items }: { items: IngredientItem[] }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;

  const visible = showAll ? items : items.slice(0, INITIAL);
  const flagged = items.filter((i) => i.flagged).length;

  return (
    <Panel style={styles.panel}>
      <SectionTitle style={styles.title}>Ingredients</SectionTitle>
      {flagged > 0 ? (
        <Text style={[styles.summary, { color: colors.fgMuted }]}>
          {flagged} flagged · tap an item for why
        </Text>
      ) : null}
      {visible.map((item, i) => (
        <IngredientRow key={`${item.display}-${i}`} item={item} />
      ))}
      {items.length > INITIAL ? (
        <Pressable onPress={() => setShowAll((v) => !v)} style={styles.more}>
          <Text style={[styles.moreText, { color: colors.accent }]}>
            {showAll ? "Show less" : `Show all ${items.length}`}
          </Text>
        </Pressable>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  title: { fontSize: 20, marginBottom: spacing.xs },
  summary: { fontFamily: fonts.sans, fontSize: 12, marginBottom: spacing.sm },
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
});
