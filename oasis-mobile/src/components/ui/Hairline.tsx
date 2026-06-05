import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme-context";

interface HairlineProps {
  style?: ViewStyle;
  /** Vertical hairline (default false = horizontal) */
  vertical?: boolean;
}

/**
 * A 1px hairline that fades in from the edges — matches the web `.hairline` class.
 * Use between sections instead of plain borderBottom.
 */
export function Hairline({ style, vertical = false }: HairlineProps) {
  const { colors } = useTheme();
  const lineColor = colors.lineStrong;

  if (vertical) {
    return (
      <LinearGradient
        colors={["transparent", lineColor, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.vertical, style]}
      />
    );
  }

  return (
    <LinearGradient
      colors={["transparent", lineColor, "transparent"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.horizontal, style]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: { height: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  vertical: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
});
