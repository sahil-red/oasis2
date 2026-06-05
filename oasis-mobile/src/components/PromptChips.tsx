import { ScrollView, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { useRotatingPrompts } from "@/hooks/useRotatingPrompts";
import { colors, fonts, radius, spacing } from "@/theme";

export function PromptChips({
  onSelect,
  prompts,
  style,
}: {
  onSelect: (p: string) => void;
  prompts?: string[];
  style?: ViewStyle;
}) {
  const rotated = useRotatingPrompts();
  const list = prompts ?? rotated;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={styles.row}
    >
      {list.map((p) => (
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
    backgroundColor: colors.bgSoft,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  text: { fontFamily: fonts.sans, color: colors.fgMuted, fontSize: 13 },
});
