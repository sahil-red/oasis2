import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { colors, fonts, radius, spacing, typography } from "@/theme";

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
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
      <Ionicons name="sparkles" size={20} color={colors.accent} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.fgDim}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!loading}
      />
      <Pressable
        style={[styles.btn, (!value.trim() || loading) && styles.btnDisabled]}
        onPress={onSubmit}
        disabled={!value.trim() || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.bg} size="small" />
        ) : (
          <Ionicons name="arrow-forward" size={20} color={colors.bg} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingLeft: spacing.md,
    paddingRight: 4,
    minHeight: 52,
  },
  wrapFocused: {
    borderColor: colors.lineStrong,
  },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: typography.body.fontSize,
    color: colors.fg,
    paddingVertical: spacing.sm,
  },
  btn: {
    backgroundColor: colors.fg,
    borderRadius: radius.lg,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.45 },
});
