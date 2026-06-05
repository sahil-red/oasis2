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
          <Text style={[styles.logoText, { color: colors.bg, fontFamily: fonts.display }]}>S</Text>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 18,
    lineHeight: 20,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: -0.3,
  },
});
