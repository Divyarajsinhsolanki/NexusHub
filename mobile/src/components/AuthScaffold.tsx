import { Image } from 'expo-image';
import { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';

type Props = PropsWithChildren<{
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

export function AuthScaffold({ title, subtitle, footer, children }: Props) {
  const theme = useAppTheme();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.brand}>
            <Image accessibilityLabel="Nexus Hub" contentFit="contain" source={require('../../assets/images/nexus-logo.webp')} style={styles.logo} />
            <View style={styles.brandCopy}>
              <Text style={[styles.product, { color: theme.text }]}>Nexus Hub</Text>
              <Text style={[styles.kicker, { color: theme.textMuted }]}>WORKSPACE COMMAND CENTER</Text>
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 36 },
  content: { alignSelf: 'center', maxWidth: 440, width: '88%' },
  brand: { alignItems: 'center', flexDirection: 'row', marginBottom: 46 },
  logo: { borderRadius: 8, height: 54, width: 54 },
  brandCopy: { marginLeft: 14 },
  product: { fontSize: 25, fontWeight: '800', letterSpacing: 0 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 0, marginTop: 3 },
  headingBlock: { marginBottom: 26 },
  title: { fontSize: 29, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  footer: { alignItems: 'center', marginTop: 26 },
});
