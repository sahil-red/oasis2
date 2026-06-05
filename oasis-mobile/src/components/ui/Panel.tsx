import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radius, spacing } from "@/theme";

export function Panel({
  soft,
  style,
  children,
  ...rest
}: ViewProps & { soft?: boolean }) {
  return (
    <View
      style={[styles.panel, soft && styles.soft, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  soft: {
    backgroundColor: colors.bgSoft,
  },
});
