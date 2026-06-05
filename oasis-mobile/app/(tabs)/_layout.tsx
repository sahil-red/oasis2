import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useBasket } from "@/lib/basket";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/theme";

export default function TabLayout() {
  const basket = useBasket();
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            tint={isDark ? "dark" : "light"}
            intensity={50}
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.line,
                backgroundColor: isDark
                  ? "rgba(10,10,11,0.75)"
                  : "rgba(250,247,242,0.75)",
              },
            ]}
          />
        ),
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
