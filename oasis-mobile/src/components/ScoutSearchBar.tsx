import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/lib/theme-context";
import { motion } from "@/theme/motion";
import { fonts, radius, spacing, typography } from "@/theme";

export function ScoutSearchBar({
  value,
  onChangeText,
  onSubmit,
  loading,
  placeholder = "Ask Scout anything…",
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const focusAnim = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focusAnim.value === 1 ? colors.accent + "88" : colors.line,
    shadowOpacity: focusAnim.value * 0.12,
  }));

  return (
    <Animated.View style={[
      styles.wrap,
      { backgroundColor: colors.panel, shadowColor: colors.accent },
      borderStyle,
    ]}>
      <Ionicons name="sparkles" size={19} color={colors.accent} style={styles.icon} />
      <TextInput
        style={[styles.input, { color: colors.fg }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.fgDim}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => { focusAnim.value = withTiming(1, motion.timingFast); }}
        onBlur={() => { focusAnim.value = withTiming(0, motion.timingFast); }}
        editable={!loading}
      />
      <Pressable
        style={[styles.btn, { backgroundColor: colors.fg }, loading && styles.btnLoading]}
        onPress={onSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.bg} size="small" />
        ) : (
          <Ionicons name="arrow-forward" size={19} color={colors.bg} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xxl,
    borderWidth: 1,
    paddingLeft: spacing.md,
    paddingRight: 4,
    minHeight: 52,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 0,
  },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: typography.body.fontSize,
    paddingVertical: spacing.sm,
  },
  btn: {
    borderRadius: radius.lg,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLoading: { opacity: 0.6 },
});
