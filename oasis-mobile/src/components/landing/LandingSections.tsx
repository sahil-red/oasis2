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
import { Panel } from "@/components/ui/Panel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { runLandingAction } from "@/lib/landing-actions";
import { catalogTierFill } from "@/lib/score";
import { colors, fonts, radius, spacing } from "@/theme";
import type {
  LandingBestInClassCategory,
  LandingDodgeProduct,
  LandingFact,
  LandingGoalBoard,
  LandingInsights,
} from "@/types/api";

const FACT_BORDER: Record<string, string> = {
  bad: colors.bad,
  good: colors.good,
  neutral: colors.lineStrong,
};

export function LandingPickCard({
  landing,
}: {
  landing: NonNullable<LandingInsights["pickOfDay"]>;
}) {
  const router = useRouter();
  const { pick, reasons } = landing;
  return (
    <Pressable
      style={styles.pickCard}
      onPress={() => router.push(`/product/${pick.slug}`)}
    >
      <Eyebrow style={styles.pickEyebrow}>Scout&apos;s pick today</Eyebrow>
      <View style={styles.pickRow}>
        {pick.image ? (
          <Image source={{ uri: pick.image }} style={styles.pickImage} contentFit="contain" />
        ) : (
          <View style={[styles.pickImage, styles.pickImageEmpty]} />
        )}
        <View style={styles.pickBody}>
          {pick.brand ? <Text style={styles.pickBrand}>{pick.brand.toUpperCase()}</Text> : null}
          <Text style={styles.pickName} numberOfLines={2}>
            {pick.name}
          </Text>
          {reasons[0] ? <Text style={styles.pickReason}>{reasons[0]}</Text> : null}
          {pick.score != null ? (
            <View style={styles.pickScoreRow}>
              <View
                style={[styles.scoreDot, { backgroundColor: catalogTierFill(pick.score) }]}
              />
              <Text style={styles.pickScore}>Score {Math.round(pick.score)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function LandingFacts({ facts }: { facts: LandingFact[] }) {
  const router = useRouter();
  if (!facts.length) return null;
  return (
    <View style={styles.factsSection}>
      <Eyebrow>What we found</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm }}>Label intelligence</SectionTitle>
      {facts.map((fact) => (
        <Panel
          key={fact.headline}
          style={
            [
              styles.factCard,
              { borderLeftColor: FACT_BORDER[fact.tone] ?? colors.line },
            ] as ViewStyle[]
          }
        >
          <Text style={styles.factStat}>{fact.stat}</Text>
          <Text style={styles.factHeadline}>{fact.headline}</Text>
          <Pressable
            style={styles.factCta}
            onPress={() => runLandingAction(router, fact.action)}
          >
            <Text style={styles.factCtaText}>{fact.cta}</Text>
          </Pressable>
        </Panel>
      ))}
    </View>
  );
}

export function LandingGoalBoards({ boards }: { boards: LandingGoalBoard[] }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  if (!boards.length) return null;
  const board = boards[active % boards.length]!;

  return (
    <View style={styles.section}>
      <Eyebrow>Eat for your goal</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm }}>Picks for your lifestyle</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.goalTabs}>
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
      <Text style={styles.goalTagline}>{board.tagline}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalRail}>
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
            </View>
            <Text style={styles.goalName} numberOfLines={2}>
              {pick.name}
            </Text>
            {pick.price != null ? (
              <Text style={styles.goalPrice}>₹{pick.price}</Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        style={styles.seeAll}
        onPress={() =>
          router.push({ pathname: "/(tabs)/browse", params: { goal: board.goal } })
        }
      >
        <Text style={styles.seeAllText}>Browse for {board.label}</Text>
      </Pressable>
    </View>
  );
}

export function LandingBestInClass({ categories }: { categories: LandingBestInClassCategory[] }) {
  const router = useRouter();
  if (!categories.length) return null;
  return (
    <View style={styles.section}>
      <Eyebrow>Best in class</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm }}>Top of each aisle</SectionTitle>
      {categories.slice(0, 3).map((cat) => (
        <View key={cat.label} style={styles.bicBlock}>
          <View style={styles.bicHeader}>
            <Text style={styles.bicLabel}>{cat.label}</Text>
            <Text style={styles.bicMeta}>
              avg {Math.round(cat.avgScore)} · {cat.skipPct}% skip
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {cat.products.slice(0, 4).map((p) => (
              <Pressable
                key={p.slug}
                style={styles.bicCard}
                onPress={() => router.push(`/product/${p.slug}`)}
              >
                {p.image ? (
                  <Image source={{ uri: p.image }} style={styles.bicImage} contentFit="contain" />
                ) : null}
                <Text style={styles.bicName} numberOfLines={2}>
                  {p.name}
                </Text>
                <ScoreBadge score={p.score} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

export function LandingDodgeList({ items }: { items: LandingDodgeProduct[] }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Eyebrow>Claims vs reality</Eyebrow>
      <SectionTitle style={{ marginTop: spacing.sm }}>Products to dodge</SectionTitle>
      {items.slice(0, 4).map((item) => (
        <Pressable
          key={item.slug}
          style={styles.dodgeCard}
          onPress={() => router.push(`/product/${item.slug}`)}
        >
          <View style={styles.dodgeTop}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.dodgeThumb} contentFit="contain" />
            ) : null}
            <View style={styles.dodgeTitle}>
              <Text style={styles.dodgeName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.dodgeScore}>Score {item.score}</Text>
            </View>
          </View>
          <View style={styles.dodgeRow}>
            <Text style={styles.dodgeLabel}>Claim</Text>
            <Text style={styles.dodgeClaim}>{item.claim}</Text>
          </View>
          <View style={styles.dodgeRow}>
            <Text style={styles.dodgeLabel}>Reality</Text>
            <Text style={styles.dodgeReality}>{item.reality}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

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
        <Text style={styles.statLabel}>avg score</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  factsSection: { marginTop: spacing.xl },
  pickCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  pickEyebrow: { marginBottom: spacing.sm },
  pickRow: { flexDirection: "row", gap: spacing.md },
  pickImage: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSoft,
  },
  pickImageEmpty: { borderWidth: 1, borderColor: colors.line },
  pickBody: { flex: 1, justifyContent: "center" },
  pickBrand: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1.2, color: colors.fgDim },
  pickName: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.fg, marginTop: 4 },
  pickReason: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, marginTop: 6 },
  pickScoreRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  scoreDot: { width: 8, height: 8, borderRadius: 4 },
  pickScore: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 14 },
  factCard: {
    marginTop: spacing.md,
    borderLeftWidth: 3,
  },
  factStat: { fontFamily: fonts.display, fontSize: 36, color: colors.fg },
  factHeadline: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 15, marginTop: 6, lineHeight: 22 },
  factCta: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    backgroundColor: colors.fg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  factCtaText: { fontFamily: fonts.sansSemiBold, color: colors.bg, fontSize: 13 },
  goalTabs: { marginTop: spacing.md, maxHeight: 44 },
  goalTab: {
    marginRight: spacing.sm,
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
  goalTagline: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 14, marginTop: spacing.sm },
  goalRail: { gap: spacing.md, paddingVertical: spacing.md },
  goalCard: { width: 140 },
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
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(10,10,11,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  goalMetaText: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: colors.fg },
  goalName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.fg, marginTop: 8 },
  goalPrice: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim, marginTop: 4 },
  seeAll: { alignSelf: "flex-start", paddingVertical: spacing.sm },
  seeAllText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 14 },
  bicBlock: { marginTop: spacing.lg },
  bicHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  bicLabel: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.fg },
  bicMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim },
  bicCard: {
    width: 120,
    marginRight: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
  },
  bicImage: { width: "100%", height: 80 },
  bicName: { fontFamily: fonts.sans, fontSize: 12, color: colors.fg, marginTop: 6, minHeight: 32 },
  dodgeCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
  },
  dodgeTop: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  dodgeThumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.bgSoft },
  dodgeTitle: { flex: 1 },
  dodgeName: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.fg },
  dodgeScore: { fontFamily: fonts.sans, fontSize: 12, color: colors.bad, marginTop: 4 },
  dodgeRow: { marginTop: spacing.sm },
  dodgeLabel: { fontFamily: fonts.sansSemiBold, fontSize: 10, color: colors.fgDim, textTransform: "uppercase", letterSpacing: 1 },
  dodgeClaim: { fontFamily: fonts.sans, fontSize: 13, color: colors.fgMuted, marginTop: 2 },
  dodgeReality: { fontFamily: fonts.sans, fontSize: 13, color: colors.fg, marginTop: 2 },
  statsStrip: {
    marginTop: spacing.xl,
    flexDirection: "row",
    backgroundColor: colors.bgSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
  },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, backgroundColor: colors.line },
  statNum: { fontFamily: fonts.display, fontSize: 32, color: colors.fg },
  statLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.fgDim, marginTop: 4 },
});
