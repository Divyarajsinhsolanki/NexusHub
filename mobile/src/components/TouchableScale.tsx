import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, GestureResponderEvent, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

type TouchableScaleProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  haptic?: 'none' | 'selection' | 'light';
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TouchableScale({
  children,
  disabled = false,
  haptic = 'selection',
  onPress,
  onPressIn,
  onPressOut,
  scaleTo = 0.97,
  style,
  ...props
}: TouchableScaleProps) {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) { scale.stopAnimation(); scale.setValue(1); }
  }, [reduceMotion, scale]);
  const animate = (toValue: number) => {
    if (reduceMotion) { scale.stopAnimation(); scale.setValue(1); return; }
    Animated.spring(scale, {
      bounciness: 4,
      speed: 28,
      toValue,
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled) animate(scaleTo);
    onPressIn?.(event);
  };
  const handlePressOut = (event: GestureResponderEvent) => {
    animate(1);
    onPressOut?.(event);
  };
  const handlePress = (event: GestureResponderEvent) => {
    if (haptic === 'selection') void Haptics.selectionAsync().catch(() => undefined);
    if (haptic === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, disabled && styles.disabled, { transform: [{ scale }] }]}>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.55 },
});
