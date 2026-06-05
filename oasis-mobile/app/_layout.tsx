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
        animation: "slide_from_right",
        animationDuration: 280,
      }}
    >
      <Stack.Screen name="index" options={{ animation: "fade" }} />
      <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="product/[slug]" options={{ presentation: "card", animation: "slide_from_right" }} />
      <Stack.Screen name="search" options={{ presentation: "card", animation: "fade" }} />
      <Stack.Screen name="subscribe" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
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
