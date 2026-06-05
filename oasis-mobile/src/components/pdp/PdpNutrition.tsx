import { StyleSheet, Text, View } from "react-native";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/Typography";
import { useTheme } from "@/lib/theme-context";
import { fonts, radius, spacing } from "@/theme";
import type { NutritionAnomalyDto, NutritionDisplayRow } from "@/types/api";

type Tone = { kind: "positive" | "limit"; label: string };

function nutritionTone(row: NutritionDisplayRow): Tone | null {
  const v = row.per100;
  if (v == null) return null;
  switch (row.id) {
    case "energy_kcal_100g":
      return v >= 450 ? { kind: "limit", label: "high" } : null;
    case "sugar_g_100g":
      if (v >= 10) return { kind: "limit", label: "high" };
      if (v <= 5) return { kind: "positive", label: "good" };
      return null;
    case "added_sugar_g_100g":
      return v >= 10 ? { kind: "limit", label: "high" } : null;
    case "saturated_fat_g_100g":
      return v >= 5 ? { kind: "limit", label: "high" } : null;
    case "trans_fat_g_100g":
      return v > 0.2 ? { kind: "limit", label: "high" } : null;
    case "sodium_mg_100g":
      return v >= 400 ? { kind: "limit", label: "high" } : null;
    case "fat_g_100g":
      return v >= 17.5 ? { kind: "limit", label: "high" } : null;
    case "protein_g_100g":
      return v >= 12 ? { kind: "positive", label: "good" } : null;
    case "fiber_g_100g":
      return v >= 3 ? { kind: "positive", label: "good" } : null;
    default:
      return null;
  }
}

function fmt(v: number | undefined) {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function ValueCell({
  value,
  unit,
  tone,
}: {
  value: number | undefined;
  unit: string;
  tone: Tone | null;
}) {
  const { colors } = useTheme();
  const toneColor =
    tone?.kind === "positive" ? colors.scoreExcellent : tone ? colors.scoreBad : colors.fg;
  const bg =
    tone?.kind === "positive"
      ? `${colors.scoreExcellent}22`
      : tone
        ? `${colors.scoreBad}22`
        : "transparent";

  return (
    <View style={[styles.valueWrap, tone ? { backgroundColor: bg } : null]}>
      <Text style={[styles.value, { color: toneColor }]}>
        {fmt(value)}
        {value != null ? (
          <Text style={[styles.unit, { color: colors.fgDim }]}> {unit}</Text>
        ) : null}
      </Text>
      {tone ? (
        <Text
          style={[
            styles.toneLabel,
            { color: tone.kind === "positive" ? colors.good : colors.bad },
          ]}
        >
          {tone.label}
        </Text>
      ) : null}
    </View>
  );
}

export function PdpNutrition({
  rows,
  anomalies,
  hasServe,
  serveG,
  packLabel,
}: {
  rows: NutritionDisplayRow[];
  anomalies: NutritionAnomalyDto[];
  hasServe: boolean;
  serveG: number | null;
  packLabel?: string | null;
}) {
  const { colors } = useTheme();
  if (!rows.length) return null;

  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");
  const meta = [
    packLabel && packLabel !== "pack" ? packLabel : null,
    hasServe && serveG ? `${serveG}g serve` : null,
  ].filter(Boolean);

  return (
    <Panel style={styles.panel}>
      <SectionTitle style={styles.title}>Nutrition</SectionTitle>
      {meta.length ? (
        <Text style={[styles.meta, { color: colors.fgMuted }]}>{meta.join(" · ")}</Text>
      ) : null}

      {critical.length ? (
        <View style={[styles.alert, styles.alertBad, { borderColor: `${colors.bad}55` }]}>
          <Text style={[styles.alertTitle, { color: colors.bad }]}>Data looks wrong</Text>
          {critical.map((a) => (
            <Text key={a.code} style={[styles.alertLine, { color: colors.bad }]}>
              • {a.message}
            </Text>
          ))}
        </View>
      ) : warnings.length ? (
        <View style={[styles.alert, styles.alertWarn, { borderColor: `${colors.warn}55` }]}>
          <Text style={[styles.alertLine, { color: colors.warn }]}>
            {warnings.map((a) => a.message).join(" · ")}
          </Text>
        </View>
      ) : null}

      <View style={[styles.tableHead, { borderBottomColor: colors.line }]}>
        <Text style={[styles.th, styles.thLabel, { color: colors.fgDim }]} />
        <Text style={[styles.th, { color: colors.fgDim }]}>per 100g</Text>
        {hasServe ? (
          <Text style={[styles.th, { color: colors.fgDim }]}>serve</Text>
        ) : null}
      </View>

      {rows.map((row) => {
        const tone = nutritionTone(row);
        return (
          <View
            key={row.id}
            style={[
              styles.tableRow,
              { borderBottomColor: colors.line },
              row.indent && styles.indent,
            ]}
          >
            <Text
              style={[
                styles.rowLabel,
                { color: row.emphasis ? colors.fg : colors.fgMuted },
              ]}
            >
              {row.label}
            </Text>
            <ValueCell value={row.per100} unit={row.unit} tone={tone} />
            {hasServe ? (
              <Text style={[styles.serveVal, { color: colors.fgMuted }]}>
                {fmt(row.perServe)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  title: { fontSize: 20, marginBottom: spacing.xs },
  meta: { fontFamily: fonts.sans, fontSize: 12, marginBottom: spacing.sm },
  alert: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  alertBad: {},
  alertWarn: {},
  alertTitle: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  alertLine: { fontFamily: fonts.sans, fontSize: 12, marginTop: 4, lineHeight: 17 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    marginTop: spacing.xs,
  },
  th: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 10, textTransform: "uppercase" },
  thLabel: { flex: 1.4 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  indent: { paddingLeft: spacing.sm },
  rowLabel: { flex: 1.4, fontFamily: fonts.sans, fontSize: 13 },
  valueWrap: { flex: 1, borderRadius: radius.sm, paddingHorizontal: 4, paddingVertical: 2 },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
  unit: { fontFamily: fonts.sans, fontSize: 10 },
  toneLabel: { fontFamily: fonts.sansMedium, fontSize: 9, textTransform: "uppercase" },
  serveVal: { flex: 1, fontFamily: fonts.sans, fontSize: 13, textAlign: "right" },
});
