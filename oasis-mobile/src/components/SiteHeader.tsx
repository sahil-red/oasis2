import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing } from "@/theme";

export function SiteHeader() {
  return (
    <View style={styles.row}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>S</Text>
      </View>
      <Text style={styles.brand}>Scout</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.fg,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.bg,
  },
  brand: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.fg,
    letterSpacing: -0.2,
  },
});
