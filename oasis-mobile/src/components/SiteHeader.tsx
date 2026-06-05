import { StyleSheet, Text, View } from "react-native";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/lib/theme-context";
import { fonts, radius, spacing } from "@/theme";

export function SiteHeader() {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.logo, { backgroundColor: colors.fg }]}>
          <Text style={[styles.logoText, { color: colors.bg }]}>S</Text>
        </View>
        <Text style={[styles.brand, { color: colors.fg }]}>Scout</Text>
      </View>
      <ThemeToggle />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
  },
  brand: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
});
