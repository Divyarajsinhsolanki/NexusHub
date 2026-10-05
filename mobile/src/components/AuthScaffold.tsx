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
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orbit, { borderColor: theme.primary, backgroundColor: theme.primarySoft }]} />
        <View style={[styles.orbitSmall, { borderColor: theme.primary, backgroundColor: theme.primarySoft }]} />
        <View style={[styles.accentTile, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.content, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, shadowColor: theme.shadow }]}>
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
  screen: { flex: 1, overflow: 'hidden' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 36 },
  content: { alignSelf: 'center', maxWidth: 440, width: '92%', borderRadius: 24, borderWidth: 1, padding: 24, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 28, elevation: 3 },
  orbit: { position: 'absolute', right: -150, top: -100, width: 440, height: 440, borderRadius: 220, borderWidth: 1, opacity: 0.35 },
  orbitSmall: { position: 'absolute', left: -100, bottom: -60, width: 300, height: 300, borderRadius: 150, borderWidth: 1, opacity: 0.3 },
  accentTile: { position: 'absolute', right: 35, bottom: 90, width: 80, height: 80, borderRadius: 20, borderWidth: 1, transform: [{ rotate: '25deg' }], opacity: 0.3 },
  brand: { alignItems: 'center', flexDirection: 'row', marginBottom: 28 },
  logo: { borderRadius: 8, height: 54, width: 54 },
  brandCopy: { marginLeft: 14 },
  product: { fontSize: 25, fontWeight: '800', letterSpacing: 0 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 0, marginTop: 3 },
  headingBlock: { marginBottom: 26 },
  title: { fontSize: 29, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  footer: { alignItems: 'center', marginTop: 26 },
});
