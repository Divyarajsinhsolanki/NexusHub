import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, PlayCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthProvider';
import { AuthScaffold } from '@/src/components/AuthScaffold';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useAppTheme } from '@/src/theme';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type LoginFields = z.infer<typeof schema>;
const googleAuthConfigured = Boolean(
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY
    && process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
    && process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
    && process.env.EXPO_PUBLIC_FIREBASE_APP_ID
    && process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
);

export default function LoginScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { signIn, signInWithGoogle, signInDemo } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFields>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const submit = handleSubmit(async ({ email, password }) => {
    try {
      await signIn(email, password);
    } catch (error) {
      setError('root', { message: apiErrorMessage(error) });
    }
  });

  const google = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'GoogleSignInCancelledError')) {
        setError('root', { message: apiErrorMessage(error) });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const demo = async () => {
    setDemoLoading(true);
    try {
      await signInDemo();
    } catch (error) {
      setError('root', { message: apiErrorMessage(error) });
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Sign in to review your day, move work forward, and stay close to your team."
      footer={
        <View style={styles.footer}><Text style={[styles.footerText, { color: theme.textMuted }]}>New to Nexus Hub?{' '}
          <Text accessibilityRole="link" onPress={() => router.push('/signup')} style={{ color: theme.primary, fontWeight: '700' }}>Create an account</Text>
        </Text><Pressable accessibilityRole="link" onPress={() => router.replace('/')} style={styles.portfolioLink}><ArrowLeft color={theme.primary} size={15} /><Text style={[styles.portfolioLabel, { color: theme.primary }]}>Back to portfolio</Text></Pressable></View>
      }>
      <Text style={[styles.label, { color: theme.text }]}>Email</Text>
      <Controller
        control={control}
        name="email"
        render={({ field: { onBlur, onChange, value } }) => (
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="you@company.com"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { borderColor: errors.email ? theme.danger : theme.border, color: theme.text, backgroundColor: theme.surface }]}
            value={value}
          />
        )}
      />
      {errors.email ? <Text style={[styles.error, { color: theme.danger }]}>{errors.email.message}</Text> : null}

      <View style={styles.passwordHeader}>
        <Text style={[styles.label, { color: theme.text }]}>Password</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}>
          <Text style={[styles.forgot, { color: theme.primary }]}>Forgot password?</Text>
        </Pressable>
      </View>
      <View>
        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextInput
              accessibilityLabel="Password"
              autoComplete="password"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="Password"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              style={[styles.input, styles.passwordInput, { borderColor: errors.password ? theme.danger : theme.border, color: theme.text, backgroundColor: theme.surface }]}
              value={value}
            />
          )}
        />
        <Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setShowPassword((value) => !value)} style={styles.eye}>
          {showPassword ? <EyeOff color={theme.textMuted} size={20} /> : <Eye color={theme.textMuted} size={20} />}
        </Pressable>
      </View>
      {errors.password ? <Text style={[styles.error, { color: theme.danger }]}>{errors.password.message}</Text> : null}
      {errors.root ? <Text accessibilityRole="alert" style={[styles.rootError, { color: theme.danger }]}>{errors.root.message}</Text> : null}
      <PrimaryButton label="Sign in" loading={isSubmitting} onPress={submit} />

      {googleAuthConfigured ? (
        <>
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </View>
          <Pressable accessibilityRole="button" disabled={googleLoading} onPress={google} style={[styles.googleButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={styles.googleMark}><Text style={styles.googleMarkText}>G</Text></View>
            <Text style={[styles.googleLabel, { color: theme.text }]}>{googleLoading ? 'Connecting...' : 'Continue with Google'}</Text>
          </Pressable>
        </>
      ) : null}
      <View style={[styles.demoPanel, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <View style={styles.demoCopy}>
          <Text style={[styles.demoTitle, { color: theme.text }]}>Explore before signing up</Text>
          <Text style={[styles.demoText, { color: theme.textMuted }]}>Open a safe, read-only workspace with realistic project data.</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={demoLoading || isSubmitting || googleLoading} onPress={demo} style={[styles.demoButton, { backgroundColor: theme.text }]}>
          <PlayCircle color={theme.background} size={19} />
          <Text style={[styles.demoButtonLabel, { color: theme.background }]}>{demoLoading ? 'Opening...' : 'View demo'}</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { borderRadius: 8, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  passwordInput: { paddingRight: 48 },
  eye: { alignItems: 'center', height: 52, justifyContent: 'center', position: 'absolute', right: 2, top: 0, width: 44 },
  passwordHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 17 },
  forgot: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  error: { fontSize: 12, marginTop: 5 },
  rootError: { fontSize: 13, lineHeight: 18, marginBottom: 14, marginTop: 14 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', marginVertical: 22 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, marginHorizontal: 12 },
  googleButton: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 50 },
  googleMark: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#d9dee7', borderRadius: 10, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  googleMarkText: { color: '#4285f4', fontSize: 14, fontWeight: '900' },
  googleLabel: { fontSize: 15, fontWeight: '700', marginLeft: 9 },
  demoPanel: { borderRadius: 8, borderWidth: 1, marginTop: 18, padding: 14 },
  demoCopy: { marginBottom: 13 },
  demoTitle: { fontSize: 15, fontWeight: '800' },
  demoText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  demoButton: { alignItems: 'center', borderRadius: 6, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 46 },
  demoButtonLabel: { fontSize: 14, fontWeight: '800' },
  footer: { alignItems: 'center', gap: 13 },
  footerText: { fontSize: 14, textAlign: 'center' },
  portfolioLink: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 44 },
  portfolioLabel: { fontSize: 12, fontWeight: '800' },
});
