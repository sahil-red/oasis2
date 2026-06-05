import { ScrollView, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing } from "@/theme";

const DEFAULT_PROMPTS = [
  "zero sugar soft drinks",
  "ghee from grass fed cows",
  "low sugar biscuits",
  "high protein curd under ₹100",
  "millet based snacks",
];

export function PromptChips({
  onSelect,
  prompts = DEFAULT_PROMPTS,
}: {
  onSelect: (p: string) => void;
  prompts?: string[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {prompts.map((p) => (
        <Pressable key={p} style={styles.chip} onPress={() => onSelect(p)}>
          <Text style={styles.text}>{p}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    backgroundColor: colors.panel2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  text: { color: colors.fgMuted, fontSize: 13 },
});
