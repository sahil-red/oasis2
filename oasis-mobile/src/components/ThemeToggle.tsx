import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius } from "@/theme";

export function ThemeToggle() {
  const { isDark, toggle, colors } = useTheme();
  return (
    <Pressable
      onPress={toggle}
      hitSlop={10}
      style={[styles.btn, { borderColor: colors.line }]}
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Ionicons
        name={isDark ? "sunny-outline" : "moon-outline"}
        size={20}
        color={colors.fgMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
