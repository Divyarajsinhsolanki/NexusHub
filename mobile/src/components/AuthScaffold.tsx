import { Image } from 'expo-image';
import { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme';

type Props = PropsWithChildren<{
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

export function AuthScaffold({ title, subtitle, footer, children }: Props) {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.surface }]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.brand}>
            <Image accessibilityLabel="Nexus Hub" contentFit="contain" source={require('../../assets/images/nexus-logo.webp')} style={styles.logo} />
            <View style={styles.brandCopy}>
              <Text style={[styles.product, { color: theme.text }]}>Nexus Hub</Text>
              <Text style={[styles.kicker, { color: theme.textMuted }]}>Your workspace</Text>
            </View>
          </View>

          <View style={styles.headingBlock}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
          </View>

          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  content: { alignSelf: 'center', maxWidth: 440, width: '100%', paddingHorizontal: 24 },
  brand: { alignItems: 'center', flexDirection: 'row', marginBottom: 32 },
  logo: { borderRadius: 8, height: 44, width: 44 },
  brandCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  product: { fontSize: 21, fontWeight: '800', letterSpacing: 0 },
  kicker: { fontSize: 12, letterSpacing: 0, marginTop: 3 },
  headingBlock: { marginBottom: 24 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  footer: { alignItems: 'center', marginTop: 26 },
});
