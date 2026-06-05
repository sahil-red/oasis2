import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";

export function Screen({
  children,
  edges = ["top"],
  style,
  ...rest
}: ViewProps & { edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg },
        edges.includes("top") && { paddingTop: insets.top },
        edges.includes("bottom") && { paddingBottom: insets.bottom },
        style,
      ]}
      {...rest}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
