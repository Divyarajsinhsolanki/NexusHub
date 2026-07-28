import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
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
  const { control, handleSubmit, setError, formState: { errors, isSubmitting, isSubmitSuccessful } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const submit = handleSubmit(async ({ email }) => {
    try { await forgotPassword(email); } catch (error) { setError('root', { message: apiErrorMessage(error) }); }
  });
  return (
    <AuthScaffold title="Reset your password" subtitle="Enter your account email. If it matches an account, we will send a secure reset link."
      footer={<Text accessibilityRole="link" onPress={() => router.back()} style={{ color: theme.primary, fontWeight: '700' }}>Back to sign in</Text>}>
      {isSubmitSuccessful ? <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.surfaceMuted, color: theme.success }]}>Check your inbox for the password reset link.</Text> : (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <Controller control={control} name="email" render={({ field: { onBlur, onChange, value } }) => <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" onBlur={onBlur} onChangeText={onChange} placeholder="you@company.com" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surface, borderColor: errors.email ? theme.danger : theme.border, color: theme.text }]} value={value} />} />
          {errors.email ? <Text style={{ color: theme.danger }}>{errors.email.message}</Text> : null}
          {errors.root ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{errors.root.message}</Text> : null}
          <PrimaryButton label="Send reset link" loading={isSubmitting} onPress={submit} />
        </>
      )}
    </AuthScaffold>
  );
}
const styles = StyleSheet.create({ label: { fontSize: 14, fontWeight: '700', marginBottom: 8 }, input: { borderRadius: 8, borderWidth: 1, fontSize: 16, marginBottom: 16, minHeight: 52, paddingHorizontal: 14 }, notice: { borderRadius: 8, fontSize: 15, lineHeight: 22, padding: 18 } });
