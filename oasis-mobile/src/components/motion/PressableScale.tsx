import * as Haptics from "expo-haptics";
import { type ReactNode } from "react";
import { type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/theme/motion";

interface PressableScaleProps {
  children: ReactNode;
  onPress?: () => void;
  haptic?: "light" | "medium" | "none";
  scaleTo?: number;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}

function triggerHaptic(haptic: "light" | "medium" | "none") {
  if (haptic === "light") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else if (haptic === "medium") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

export function PressableScale({
  children,
  onPress,
  haptic = "light",
  scaleTo = 0.97,
  disabled = false,
  style,
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      "worklet";
      if (!reducedMotion) {
        scale.value = withSpring(scaleTo, motion.springSnappy);
      }
    })
    .onFinalize((e) => {
      "worklet";
      scale.value = withSpring(1, motion.springSnappy);
      if (e.state === 4 /* END */) {
        if (haptic !== "none") runOnJS(triggerHaptic)(haptic);
        if (onPress) runOnJS(onPress)();
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[animStyle, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
