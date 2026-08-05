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

const schema = z.object({
  first_name: z.string().trim().min(1, 'Enter your first name.'),
  last_name: z.string().trim().min(1, 'Enter your last name.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
  password_confirmation: z.string(),
}).refine((value) => value.password === value.password_confirmation, { path: ['password_confirmation'], message: 'Passwords do not match.' });

type Fields = z.infer<typeof schema>;

export default function SignupScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { signUp } = useAuth();
  const { control, handleSubmit, setError, formState: { errors, isSubmitting, isSubmitSuccessful } } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', last_name: '', email: '', password: '', password_confirmation: '' },
  });
  const submit = handleSubmit(async (values) => {
    try { await signUp(values); } catch (error) { setError('root', { message: apiErrorMessage(error) }); }
  });

  return (
    <AuthScaffold title="Create your workspace" subtitle="Start with a private workspace. You can add teams, projects, and members after confirming your email."
      footer={<Text style={{ color: theme.textMuted }}>Already registered? <Text accessibilityRole="link" onPress={() => router.replace(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` as never : '/login')} style={{ color: theme.primary, fontWeight: '700' }}>Sign in</Text></Text>}>
      {isSubmitSuccessful ? (
        <Text accessibilityRole="alert" style={[styles.success, { backgroundColor: theme.surfaceMuted, color: theme.success }]}>Account created. Check your email to confirm it, then return to sign in.</Text>
      ) : (
        <>
          {(['first_name', 'last_name', 'email', 'password', 'password_confirmation'] as const).map((name) => (
            <Controller key={name} control={control} name={name} render={({ field: { onBlur, onChange, value } }) => (
              <>
                <Text style={[styles.label, { color: theme.text }]}>{labels[name]}</Text>
                <TextInput accessibilityLabel={labels[name]} autoCapitalize={name === 'email' ? 'none' : 'words'} keyboardType={name === 'email' ? 'email-address' : 'default'} onBlur={onBlur} onChangeText={onChange} placeholder={labels[name]} placeholderTextColor={theme.textMuted} secureTextEntry={name.includes('password')} style={[styles.input, { backgroundColor: theme.surface, borderColor: errors[name] ? theme.danger : theme.border, color: theme.text }]} value={value} />
                {errors[name] ? <Text style={[styles.error, { color: theme.danger }]}>{errors[name]?.message}</Text> : null}
              </>
            )} />
          ))}
          {errors.root ? <Text accessibilityRole="alert" style={[styles.rootError, { color: theme.danger }]}>{errors.root.message}</Text> : null}
          <PrimaryButton label="Create account" loading={isSubmitting} onPress={submit} />
        </>
      )}
    </AuthScaffold>
  );
}

const labels = { first_name: 'First name', last_name: 'Last name', email: 'Email', password: 'Password', password_confirmation: 'Confirm password' };
const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', marginBottom: 7, marginTop: 12 },
  input: { borderRadius: 8, borderWidth: 1, fontSize: 16, minHeight: 50, paddingHorizontal: 14 },
  error: { fontSize: 12, marginTop: 4 },
  rootError: { fontSize: 13, marginVertical: 12 },
  success: { borderRadius: 8, fontSize: 15, fontWeight: '600', lineHeight: 22, padding: 18 },
});
