import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius, spacing } from "@/theme";

export function Panel({
  soft,
  style,
  children,
  ...rest
}: ViewProps & { soft?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: soft ? colors.bgSoft : colors.panel,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.md,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
