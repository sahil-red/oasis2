import { StyleSheet, Text, View, type TextProps, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { fonts, typography } from "@/theme";

export function Eyebrow({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.eyebrow, { color: colors.fgDim }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function DisplayTitle({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.display, { color: colors.fg }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.section, { color: colors.fg }, style]} {...rest}>
      {children}
    </Text>
  );
}

interface DisplayHeroProps {
  /** Main text before the accent */
  text: string;
  /** Italic accent phrase in accent color */
  accent?: string;
  style?: ViewStyle;
}

/**
 * The signature editorial hero component:
 * "We read the back label *so you don't have to*."
 *
 * Usage:
 *   <DisplayHero text="We read the back label" accent="so you don't have to" />
 */
export function DisplayHero({ text, accent, style }: DisplayHeroProps) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      <Text style={[styles.hero, { color: colors.fg }]}>
        {text}
        {accent ? (
          <>
            {"\n"}
            <Text style={[styles.heroAccent, { color: colors.accent }]}>{accent}</Text>
          </>
        ) : null}
        {"."}
      </Text>
    </View>
  );
}

/** Inline accent span — use inside a Text node for inline styling. */
export function AccentText({ children, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.accentSpan, { color: colors.accent }]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.eyebrow },
  display: { ...typography.sectionTitle },
  section: { ...typography.sectionTitle, fontSize: 24, lineHeight: 28 },
  hero: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 43,
    letterSpacing: -0.8,
    textAlign: "left",
  },
  heroAccent: {
    fontFamily: fonts.displayItalic,
    fontStyle: "italic",
    fontSize: 40,
    lineHeight: 43,
    letterSpacing: -0.8,
  },
  accentSpan: {
    fontFamily: fonts.displayItalic,
    fontStyle: "italic",
  },
});
