import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/Typography";
import { useTheme } from "@/lib/theme-context";
import { fonts, radius, spacing } from "@/theme";
import type { PdpSwap } from "@/types/api";

function SwapCard({ swap }: { swap: PdpSwap }) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.panel2, borderColor: colors.line }]}
      onPress={() => router.push(`/product/${swap.slug}`)}
    >
      {swap.image ? (
        <Image source={{ uri: swap.image }} style={styles.image} contentFit="contain" />
      ) : (
        <View style={[styles.image, styles.imageEmpty, { backgroundColor: colors.bgSoft }]}>
          <Text style={{ color: colors.fgDim, fontSize: 10 }}>No image</Text>
        </View>
      )}
      <Text style={[styles.name, { color: colors.fg }]} numberOfLines={2}>
        {swap.name}
      </Text>
      {swap.brand ? (
        <Text style={[styles.brand, { color: colors.fgDim }]} numberOfLines={1}>
          {swap.brand}
        </Text>
      ) : null}
      <View style={styles.scoreRow}>
        <ScoreBadge score={swap.score} label={swap.grade ?? undefined} />
        {swap.goal_fit > 0 ? (
          <Text style={[styles.fit, { color: colors.good }]}>+{Math.round(swap.goal_fit)} fit</Text>
        ) : null}
      </View>
      {swap.deltas.slice(0, 2).map((d) => (
        <Text key={d} style={[styles.delta, { color: colors.fgMuted }]} numberOfLines={1}>
          {d}
        </Text>
      ))}
    </Pressable>
  );
}

export function PdpSwaps({
  title,
  description,
  swaps,
}: {
  title: string;
  description?: string;
  swaps: PdpSwap[];
}) {
  const { colors } = useTheme();
  if (!swaps.length) return null;

  return (
    <Panel style={styles.panel}>
      <SectionTitle style={styles.title}>{title}</SectionTitle>
      {description ? (
        <Text style={[styles.desc, { color: colors.fgMuted }]}>{description}</Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {swaps.map((swap) => (
          <SwapCard key={swap.slug} swap={swap} />
        ))}
      </ScrollView>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  title: { fontSize: 20, marginBottom: spacing.xs },
  desc: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: spacing.sm },
  scroll: { marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
  card: {
    width: 160,
    marginRight: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
  },
  image: { width: "100%", height: 100, borderRadius: radius.md },
  imageEmpty: { alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.sansSemiBold, fontSize: 13, marginTop: spacing.sm },
  brand: { fontFamily: fonts.sans, fontSize: 11, marginTop: 2 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  fit: { fontFamily: fonts.sansMedium, fontSize: 11 },
  delta: { fontFamily: fonts.sans, fontSize: 11, marginTop: 4 },
});
