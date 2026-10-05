import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthProvider';
import { AuthScaffold } from '@/src/components/AuthScaffold';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useAppTheme } from '@/src/theme';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.') });

export default function ForgotPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { forgotPassword } = useAuth();
  const submitting = useRef(false);
  const [sent, setSent] = useState(false);
  const { control, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const submit = handleSubmit(async ({ email }) => {
    if (submitting.current) return;
    submitting.current = true; clearErrors('root');
    try { await forgotPassword(email); setSent(true); } catch (error) { setError('root', { message: apiErrorMessage(error) }); } finally { submitting.current = false; }
  });
  return (
    <AuthScaffold title="Reset your password" subtitle="Enter your account email. If it matches an account, we will send a secure reset link."
      footer={<Text accessibilityRole="link" onPress={() => router.replace('/login')} style={{ color: theme.primary, fontWeight: '700' }}>Back to sign in</Text>}>
      {sent ? <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.surfaceMuted, color: theme.success }]}>If an account exists for this email, a reset link is on the way. Check your inbox and spam folder.</Text> : (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <Controller control={control} name="email" render={({ field: { onBlur, onChange, value } }) => <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" editable={!isSubmitting} keyboardType="email-address" onBlur={onBlur} onChangeText={(next) => { clearErrors('root'); onChange(next); }} placeholder="you@company.com" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surface, borderColor: errors.email ? theme.danger : theme.border, color: theme.text }]} value={value} />} />
          {errors.email ? <Text style={{ color: theme.danger }}>{errors.email.message}</Text> : null}
          {errors.root ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{errors.root.message}</Text> : null}
          <PrimaryButton label="Send reset link" loading={isSubmitting} onPress={submit} />
        </>
      )}
    </AuthScaffold>
  );
}
const styles = StyleSheet.create({ label: { fontSize: 14, fontWeight: '700', marginBottom: 8 }, input: { borderRadius: 12, borderWidth: 1, fontSize: 16, marginBottom: 16, minHeight: 52, paddingHorizontal: 14 }, notice: { borderRadius: 12, fontSize: 15, lineHeight: 22, padding: 18 } });
