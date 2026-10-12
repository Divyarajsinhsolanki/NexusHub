import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { CornerUpLeft } from 'lucide-react-native';
import { useAppTheme } from '../../theme';

export function isReplySwipe(dx: number, dy: number) { return dx >= 64 && Math.abs(dx) > Math.abs(dy) * 1.5; }
export function SwipeToReply({ enabled, onReply, children }: { enabled: boolean; onReply: () => void; children: ReactNode }) {
  const theme = useAppTheme();
  const offset = useRef(new Animated.Value(0)).current;
  const callback = useRef(onReply); callback.current = onReply;
  const reset = () => Animated.spring(offset, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 0 }).start();
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => enabled && gesture.numberActiveTouches === 1 && gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderGrant: () => offset.stopAnimation(),
    onPanResponderMove: (_, gesture) => offset.setValue(Math.min(90, Math.max(0, gesture.dx))),
    onPanResponderRelease: (_, gesture) => { if (enabled && isReplySwipe(gesture.dx, gesture.dy)) callback.current(); reset(); },
    onPanResponderTerminate: reset,
    onPanResponderTerminationRequest: () => true,
  }), [enabled, offset]);
  return <View style={styles.row}>
    {enabled ? <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[styles.cue, { opacity: offset.interpolate({ inputRange: [0, 20, 64], outputRange: [0, 0.35, 1], extrapolate: 'clamp' }) }]}><CornerUpLeft size={22} color={theme.primary} /></Animated.View> : null}
    <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: offset }] }}>{children}</Animated.View>
  </View>;
}
const styles = StyleSheet.create({ row: { width: '100%' }, cue: { position: 'absolute', left: 12, top: 14 } });
