import { lazy, Suspense } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadingState } from '@/src/components/StateView';

const LazyCallScreen = lazy(() => import('../(tabs)/inbox/call/[id]'));

export default function RootCallScreen() {
  return (
    <Suspense fallback={<View style={styles.loading}><LoadingState label="Preparing call" /></View>}>
      <LazyCallScreen />
    </Suspense>
  );
}

const styles = StyleSheet.create({ loading: { backgroundColor: '#101216', flex: 1, justifyContent: 'center' } });
