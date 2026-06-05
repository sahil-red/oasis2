import { StyleSheet, Text, type TextProps } from "react-native";
import { colors, typography } from "@/theme";

export function Eyebrow({ children, style, ...rest }: TextProps) {
  return (
    <Text style={[styles.eyebrow, style]} {...rest}>
      {children}
    </Text>
  );
}

export function DisplayTitle({ children, style, ...rest }: TextProps) {
  return (
    <Text style={[styles.display, style]} {...rest}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, style, ...rest }: TextProps) {
  return (
    <Text style={[styles.section, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.eyebrow, color: colors.fgDim },
  display: { ...typography.sectionTitle, color: colors.fg },
  section: { ...typography.sectionTitle, color: colors.fg, fontSize: 24, lineHeight: 28 },
});
