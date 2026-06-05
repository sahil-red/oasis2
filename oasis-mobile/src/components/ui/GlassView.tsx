import { BlurView } from "expo-blur";
import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme-context";

interface GlassViewProps {
  children: ReactNode;
  intensity?: number;
  style?: ViewStyle;
  /** Show a hairline border at top */
  borderTop?: boolean;
  /** Show a hairline border at bottom */
  borderBottom?: boolean;
}

/**
 * Glass surface: blurred background + semi-transparent panel overlay + optional hairline.
 * Used for floating chrome (nav header, tab bar, sticky PDP CTA).
 */
export function GlassView({
  children,
  intensity = 40,
  style,
  borderTop = false,
  borderBottom = false,
}: GlassViewProps) {
  const { isDark, colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <BlurView
        tint={isDark ? "dark" : "light"}
        intensity={intensity}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Semi-transparent overlay to deepen the glass effect */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: isDark ? "rgba(10,10,11,0.72)" : "rgba(250,247,242,0.72)" },
        ]}
      />
      {borderTop && (
        <View style={[styles.hairline, { bottom: undefined, top: 0, backgroundColor: colors.line }]} />
      )}
      {borderBottom && (
        <View style={[styles.hairline, { top: undefined, bottom: 0, backgroundColor: colors.line }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative", overflow: "hidden" },
  hairline: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
