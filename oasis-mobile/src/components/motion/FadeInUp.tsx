import { useEffect, type ReactNode } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/theme/motion";

interface FadeInUpProps {
  children: ReactNode;
  delay?: number;
  /** Override translateY distance (default 12) */
  distance?: number;
  style?: object;
}

/**
 * Animates children from opacity 0 + translateY distance → 1 + 0 on mount.
 * Respects system reduce-motion: skips transform, keeps instant opacity.
 */
export function FadeInUp({ children, delay = 0, distance = 12, style }: FadeInUpProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const translateY = useSharedValue(reducedMotion ? 0 : distance);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, motion.timing));
    translateY.value = withDelay(delay, withTiming(0, motion.timing));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}
