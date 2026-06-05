import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/lib/auth";
import { BasketProvider } from "@/lib/basket";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <BasketProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0a0a0b" } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="product/[slug]" options={{ presentation: "card" }} />
            <Stack.Screen name="search" options={{ presentation: "modal" }} />
            <Stack.Screen name="subscribe" options={{ presentation: "modal" }} />
          </Stack>
        </BasketProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
