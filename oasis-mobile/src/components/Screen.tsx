import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

export function Screen({
  children,
  edges = ["top"],
  style,
  ...rest
}: ViewProps & { edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        edges.includes("top") && { paddingTop: insets.top },
        edges.includes("bottom") && { paddingBottom: insets.bottom },
        style,
      ]}
      {...rest}
    >
      <StatusBar style="light" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
