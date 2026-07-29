import { PropsWithChildren, ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme';
import { OfflineBanner } from './OfflineBanner';
import { DemoBanner } from './DemoBanner';
import { ImpersonationBanner } from './ImpersonationBanner';

type ScreenProps = PropsWithChildren<{ style?: StyleProp<ViewStyle>; header?: ReactNode }>;

export function Screen({ children, style, header }: ScreenProps) {
  const theme = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <OfflineBanner />
      <DemoBanner />
      <ImpersonationBanner />
      {header}
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
});
