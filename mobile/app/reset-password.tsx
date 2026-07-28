import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthProvider';
import { AuthScaffold } from '@/src/components/AuthScaffold';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useAppTheme } from '@/src/theme';

const schema = z.object({ password: z.string().min(8, 'Use at least 8 characters.'), password_confirmation: z.string() }).refine((value) => value.password === value.password_confirmation, { path: ['password_confirmation'], message: 'Passwords do not match.' });

export default function ResetPasswordScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; reset_password_token?: string }>();
  const token = params.token || params.reset_password_token || '';
  const { resetPassword } = useAuth();
  const { control, handleSubmit, setError, formState: { errors, isSubmitting, isSubmitSuccessful } } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', password_confirmation: '' } });
  const submit = handleSubmit(async (values) => {
    if (!token) return setError('root', { message: 'This reset link is missing its token.' });
    try { await resetPassword({ ...values, reset_password_token: token }); } catch (error) { setError('root', { message: apiErrorMessage(error) }); }
  });
  return (
    <AuthScaffold title="Choose a new password" subtitle="Use a strong password that you do not reuse on another service."
      footer={<Text accessibilityRole="link" onPress={() => router.replace('/login')} style={{ color: theme.primary, fontWeight: '700' }}>Return to sign in</Text>}>
      {isSubmitSuccessful ? <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.surfaceMuted, color: theme.success }]}>Password updated. You can sign in now.</Text> : (
        <>
          {(['password', 'password_confirmation'] as const).map((name) => <Controller key={name} control={control} name={name} render={({ field: { onBlur, onChange, value } }) => <><Text style={[styles.label, { color: theme.text }]}>{name === 'password' ? 'New password' : 'Confirm password'}</Text><TextInput accessibilityLabel={name === 'password' ? 'New password' : 'Confirm password'} onBlur={onBlur} onChangeText={onChange} secureTextEntry style={[styles.input, { backgroundColor: theme.surface, borderColor: errors[name] ? theme.danger : theme.border, color: theme.text }]} value={value} />{errors[name] ? <Text style={{ color: theme.danger }}>{errors[name]?.message}</Text> : null}</>} />)}
          {errors.root ? <Text accessibilityRole="alert" style={{ color: theme.danger, marginVertical: 10 }}>{errors.root.message}</Text> : null}
          <PrimaryButton label="Update password" loading={isSubmitting} onPress={submit} />
        </>
      )}
    </AuthScaffold>
  );
}
const styles = StyleSheet.create({ label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 12 }, input: { borderRadius: 8, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 14 }, notice: { borderRadius: 8, fontSize: 15, lineHeight: 22, padding: 18 } });
