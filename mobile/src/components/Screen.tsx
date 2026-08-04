import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme';
import { OfflineBanner } from './OfflineBanner';
import { DemoBanner } from './DemoBanner';
import { ImpersonationBanner } from './ImpersonationBanner';

type ScreenProps = PropsWithChildren<{ style?: StyleProp<ViewStyle>; header?: ReactNode }>;

export function Screen({ children, style, header }: ScreenProps) {
  const theme = useAppTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { duration: 160, toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { bounciness: 0, speed: 18, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <DemoBanner />
      <ImpersonationBanner />
      {header}
      <Animated.View style={[styles.content, style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
});
