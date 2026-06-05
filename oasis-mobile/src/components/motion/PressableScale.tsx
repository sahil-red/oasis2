import * as Haptics from "expo-haptics";
import { type ReactNode } from "react";
import { type ViewStyle } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/theme/motion";

interface PressableScaleProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  haptic?: "light" | "medium" | "none";
  scaleTo?: number;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  hitSlop?: number;
}

/**
 * Drop-in Pressable replacement with spring press feedback.
 * Runs entirely on the UI thread via Reanimated worklets.
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  haptic = "light",
  scaleTo = 0.97,
  disabled = false,
  style,
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const gesture = Gesture.Tap()
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
    })
    .onEnd(() => {
      "worklet";
      if (haptic !== "none") {
        // haptics can't run in worklet, run on JS thread via runOnJS
      }
    });

  // Separate long press gesture
  const longPressGesture = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(400)
    .onEnd(() => {
      "worklet";
    });

  // Composed gesture
  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      "worklet";
      if (!reducedMotion) {
        scale.value = withSpring(scaleTo, motion.springSnappy);
      }
    })
    .onEnd(() => {
      "worklet";
      scale.value = withSpring(1, motion.springSnappy);
    })
    .onFinalize(() => {
      "worklet";
      scale.value = withSpring(1, motion.springSnappy);
    })
    .shouldCancelWhenOutside(true)
    .runOnJS(true)
    .onEnd(() => {
      if (haptic === "light") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (haptic === "medium") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onPress?.();
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View style={[animStyle, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
