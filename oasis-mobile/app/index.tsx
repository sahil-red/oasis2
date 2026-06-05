import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth, supabaseConfigured } from "@/lib/auth";
import { colors } from "@/theme";

export default function Index() {
  const { ready, session } = useAuth();
  if (!supabaseConfigured) return <Redirect href="/(tabs)" />;
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}
