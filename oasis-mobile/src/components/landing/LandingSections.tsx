import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import { ScoreBadge } from "@/components/ScoreBadge";
import { runLandingAction } from "@/lib/landing-actions";
import { catalogTierFill } from "@/lib/score";
import { VERDICT_COLORS } from "@/lib/verdict";
import { colors, fonts, radius, spacing } from "@/theme";
import type {
  LandingBestInClassCategory,
  LandingDodgeProduct,
  LandingFact,
  LandingGoalBoard,
  LandingInsights,
} from "@/types/api";

// ─── Intel fact cards (horizontal scroll) ────────────────────────────────────

const FACT_ACCENT: Record<string, { stat: string; dot: string }> = {
  bad: { stat: "#f87171", dot: "#f87171" },
  good: { stat: "#34d399", dot: "#34d399" },
  neutral: { stat: colors.fg, dot: colors.fgDim },
};

export function LandingFacts({ facts }: { facts: LandingFact[] }) {
  const router = useRouter();
  if (!facts.length) return null;
  return (
    <View style={styles.section}>
      <Eyebrow style={{ paddingHorizontal: spacing.lg }}>Scout intel</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }}>
        What the data says.
      </SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.factsRail}
        style={{ marginTop: spacing.md }}
      >
        {facts.map((fact) => {
          const accent = FACT_ACCENT[fact.tone] ?? FACT_ACCENT.neutral!;
          return (
            <Pressable
              key={fact.headline}
              style={styles.factCard}
              onPress={() => runLandingAction(router, fact.action)}
            >
              <Text style={[styles.factStat, { color: accent.stat }]}>{fact.stat}</Text>
              <Text style={styles.factHeadline}>{fact.headline}</Text>
              <View style={styles.factFooter}>
                <View style={[styles.factDot, { backgroundColor: accent.dot }]} />
                <Text style={styles.factCta}>{fact.cta} →</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Goal boards ─────────────────────────────────────────────────────────────

export function LandingGoalBoards({ boards }: { boards: LandingGoalBoard[] }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  if (!boards.length) return null;
  const board = boards[active % boards.length]!;

  return (
    <View style={styles.section}>
      <Eyebrow style={{ paddingHorizontal: spacing.lg }}>Eat for your goal</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }}>
        {board.tagline}
      </SectionTitle>

      {/* Goal tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: spacing.md }}
        contentContainerStyle={styles.goalTabsRow}
      >
        {boards.map((b, i) => (
          <Pressable
            key={b.goal}
            style={[styles.goalTab, i === active && styles.goalTabActive]}
            onPress={() => setActive(i)}
          >
            <Text style={[styles.goalTabText, i === active && styles.goalTabTextActive]}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Product rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.goalRail}
      >
        {board.picks.map((pick) => (
          <Pressable
            key={pick.slug}
            style={styles.goalCard}
            onPress={() => router.push(`/product/${pick.slug}`)}
          >
            <View style={styles.goalImageWrap}>
              {pick.image ? (
                <Image source={{ uri: pick.image }} style={styles.goalImage} contentFit="contain" />
              ) : null}
              {pick.meta ? (
                <View style={styles.goalMeta}>
                  <Text style={styles.goalMetaText}>{pick.meta}</Text>
                </View>
              ) : null}
              {/* Score dot */}
              {pick.score != null ? (
                <View style={[styles.scoreCorner, { backgroundColor: catalogTierFill(pick.score) }]}>
                  <Text style={styles.scoreCornerText}>{Math.round(pick.score)}</Text>
                </View>
              ) : null}
            </View>
            {pick.brand ? (
              <Text style={styles.goalBrand} numberOfLines={1}>{pick.brand.toUpperCase()}</Text>
            ) : null}
            <Text style={styles.goalName} numberOfLines={2}>{pick.name}</Text>
            {pick.price != null ? (
              <Text style={styles.goalPrice}>₹{pick.price}</Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={{ paddingHorizontal: spacing.lg }}
        onPress={() => router.push({ pathname: "/(tabs)/browse", params: { goal: board.goal } })}
      >
        <Text style={styles.seeAllText}>Browse for {board.label} →</Text>
      </Pressable>
    </View>
  );
}

// ─── Best in class ────────────────────────────────────────────────────────────

export function LandingBestInClass({ categories }: { categories: LandingBestInClassCategory[] }) {
  const router = useRouter();
  if (!categories.length) return null;

  return (
    <View style={styles.section}>
      <Eyebrow style={{ paddingHorizontal: spacing.lg }}>Best in class</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }}>
        Top pick in every aisle.
      </SectionTitle>

      {categories.slice(0, 4).map((cat) => (
        <View key={cat.label} style={styles.bicBlock}>
          <View style={styles.bicHeader}>
            <Text style={styles.bicLabel}>{cat.label}</Text>
            <Text style={styles.bicMeta}>avg {cat.avgScore} · {cat.skipPct}% skip</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {cat.products.slice(0, 3).map((p) => (
              <Pressable
                key={p.slug}
                style={styles.bicCard}
                onPress={() => router.push(`/product/${p.slug}`)}
              >
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.bicImage} contentFit="contain" />
                ) : (
                  <View style={[styles.bicImage, { backgroundColor: colors.bgSoft }]} />
                )}
                <Text style={styles.bicName} numberOfLines={2}>{p.name}</Text>
                <View style={styles.bicFooter}>
                  {p.grade ? <Text style={styles.bicGrade}>{p.grade}</Text> : null}
                  <Text style={styles.bicScore}>{p.score}/100</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

// ─── Dodge list ───────────────────────────────────────────────────────────────

export function LandingDodgeList({ items }: { items: LandingDodgeProduct[] }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Eyebrow style={[{ paddingHorizontal: spacing.lg }, { color: "#f87171" }]}>
        Scout warning
      </Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }}>
        The marketing&apos;s a lie.
      </SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dodgeRail}
      >
        {items.slice(0, 6).map((item) => (
          <Pressable
            key={item.slug}
            style={styles.dodgeCard}
            onPress={() => router.push(`/product/${item.slug}`)}
          >
            <View style={styles.dodgeTop}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.dodgeThumb} contentFit="contain" />
              ) : (
                <View style={[styles.dodgeThumb, { backgroundColor: colors.bgSoft }]} />
              )}
              <Text style={styles.dodgeScore}>{item.score}</Text>
            </View>
            {item.brand ? (
              <Text style={styles.dodgeBrand} numberOfLines={1}>{item.brand.toUpperCase()}</Text>
            ) : null}
            <Text style={styles.dodgeName} numberOfLines={2}>{item.name}</Text>
            <View style={styles.dodgeRow}>
              <Text style={styles.dodgeClaimLabel}>Claims</Text>
              <Text style={styles.dodgeClaim}>{item.claim}</Text>
            </View>
            <View style={styles.dodgeRow}>
              <Text style={styles.dodgeRealityLabel}>Reality</Text>
              <Text style={styles.dodgeReality}>{item.reality}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

export function LandingStatsStrip({
  totalScored,
  avgScore,
}: {
  totalScored: number;
  avgScore: number;
}) {
  return (
    <View style={styles.statsStrip}>
      <View style={styles.statCell}>
        <Text style={styles.statNum}>{totalScored.toLocaleString()}</Text>
        <Text style={styles.statLabel}>products scored</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statCell}>
        <Text style={styles.statNum}>{Math.round(avgScore)}</Text>
        <Text style={styles.statLabel}>avg score /100</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },

  // Facts
  factsRail: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  factCard: {
    width: 220,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  factStat: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48 },
  factHeadline: {
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
    flex: 1,
  },
  factFooter: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  factDot: { width: 6, height: 6, borderRadius: 3 },
  factCta: { fontFamily: fonts.sansMedium, color: colors.fgMuted, fontSize: 12 },

  // Goal boards
  goalTabsRow: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  goalTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  goalTabActive: { backgroundColor: colors.fg, borderColor: colors.fg },
  goalTabText: { fontFamily: fonts.sansMedium, color: colors.fgMuted, fontSize: 13 },
  goalTabTextActive: { color: colors.bg },
  goalRail: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingVertical: spacing.md },
  goalCard: { width: 148 },
  goalImageWrap: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  goalImage: { width: "100%", height: "100%", padding: 8 },
  goalMeta: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(10,10,11,0.85)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  goalMetaText: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: colors.fg },
  scoreCorner: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCornerText: { fontFamily: fonts.sansBold, fontSize: 12, color: "#fff" },
  goalBrand: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1, color: colors.fgDim, marginTop: 8 },
  goalName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.fg, marginTop: 3, lineHeight: 17 },
  goalPrice: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim, marginTop: 3 },
  seeAllText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 14, marginTop: spacing.sm },

  // Best in class
  bicBlock: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  bicHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.sm,
  },
  bicLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.fg },
  bicMeta: { fontFamily: fonts.sans, fontSize: 11, color: colors.fgDim },
  bicCard: {
    width: 130,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
  },
  bicImage: { width: "100%", height: 88, borderRadius: radius.md },
  bicName: { fontFamily: fonts.sans, fontSize: 12, color: colors.fg, marginTop: 6, lineHeight: 16, minHeight: 32 },
  bicFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  bicGrade: { fontFamily: fonts.sansBold, fontSize: 11, color: "#34d399" },
  bicScore: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.fgDim },

  // Dodge list
  dodgeRail: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  dodgeCard: {
    width: 220,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    padding: spacing.md,
  },
  dodgeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  dodgeThumb: { width: 52, height: 52, borderRadius: radius.md },
  dodgeScore: { fontFamily: fonts.display, fontSize: 32, color: "#f87171" },
  dodgeBrand: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1, color: colors.fgDim, marginTop: 8 },
  dodgeName: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.fg, marginTop: 3, lineHeight: 18 },
  dodgeRow: { marginTop: spacing.sm },
  dodgeClaimLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 9,
    color: "#34d399",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dodgeClaim: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgMuted, marginTop: 2, lineHeight: 16 },
  dodgeRealityLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 9,
    color: "#f87171",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dodgeReality: { fontFamily: fonts.sans, fontSize: 12, color: colors.fg, marginTop: 2, lineHeight: 16 },

  // Stats strip
  statsStrip: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
  },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, backgroundColor: colors.line },
  statNum: { fontFamily: fonts.display, fontSize: 36, color: colors.fg },
  statLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim, marginTop: 4 },
});
