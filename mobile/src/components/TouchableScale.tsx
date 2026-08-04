import * as Haptics from 'expo-haptics';
import { ReactNode, useRef } from 'react';
import { Animated, GestureResponderEvent, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

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
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => {
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
