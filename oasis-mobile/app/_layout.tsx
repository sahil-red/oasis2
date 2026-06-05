import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FontProvider } from "@/components/FontProvider";
import { AuthProvider } from "@/lib/auth";
import { BasketProvider } from "@/lib/basket";
import { ThemeProvider, useTheme } from "@/lib/theme-context";

function RootStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="product/[slug]" options={{ presentation: "card" }} />
      <Stack.Screen name="search" options={{ presentation: "card" }} />
      <Stack.Screen name="subscribe" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FontProvider>
        <ThemeProvider>
          <AuthProvider>
            <BasketProvider>
              <RootStack />
            </BasketProvider>
          </AuthProvider>
        </ThemeProvider>
      </FontProvider>
    </GestureHandlerRootView>
  );
}
