import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useBasket } from "@/lib/basket";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/theme";

export default function TabLayout() {
  const basket = useBasket();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 11,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.fgDim,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ask",
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="basket"
        options={{
          title: "Basket",
          tabBarBadge: basket.count > 0 ? basket.count : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="basket" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
