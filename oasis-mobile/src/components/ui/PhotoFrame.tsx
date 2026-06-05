import { Image } from "expo-image";
import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme-context";
import { radius } from "@/theme";

interface PhotoFrameProps {
  /** Image URI */
  uri?: string | null;
  /** Alt text for accessibility */
  alt?: string;
  /** Top accent border color (verdict color). Omit for no accent. */
  accentColor?: string;
  style?: ViewStyle;
  /** Additional padding inside the frame */
  padding?: number;
  children?: ReactNode;
}

/**
 * Standard product-image container: bgSoft background, radius.xl, overflow hidden,
 * optional 2px top accent border in the verdict color.
 * Matches the web "photo-frame" treatment.
 */
export function PhotoFrame({
  uri,
  alt = "",
  accentColor,
  style,
  padding = 8,
  children,
}: PhotoFrameProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor: colors.bgSoft,
          borderColor: colors.line,
        },
        accentColor ? { borderTopColor: accentColor, borderTopWidth: 2 } : undefined,
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFillObject, { margin: padding }]}
          contentFit="contain"
          transition={200}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    aspectRatio: 1,
  },
});
