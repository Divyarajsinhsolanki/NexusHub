import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { EntityCollectionScreen, type EntityField } from '@/src/components/EntityCollectionScreen';
import { Screen } from '@/src/components/Screen';
import { ErrorState, LoadingState } from '@/src/components/StateView';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import type { EntityRecord } from '@/src/api/types';
import { useAppTheme } from '@/src/theme';

type Column = { name: string; type: string; null: boolean; default: unknown };

export default function AdminTableScreen() {
  const { table: encodedTable } = useLocalSearchParams<{ table: string }>();
  const table = decodeURIComponent(encodedTable || '');
  const meta = useQuery({ queryKey: ['admin-meta', table], queryFn: () => endpoints.rawResource<Column[]>(`/admin/meta/${encodeURIComponent(table)}`), enabled: Boolean(table) });
  if (meta.isLoading) return <Screen><LoadingState label="Loading resource definition" /></Screen>;
  if (meta.isError || !meta.data) return <Screen><ErrorState message={apiErrorMessage(meta.error)} onRetry={() => meta.refetch()} /></Screen>;

  const editable = meta.data.filter((column) => !['id', 'created_at', 'updated_at', 'encrypted_password', 'reset_password_token', 'confirmation_token'].includes(column.name)).slice(0, 12);
  const fields: EntityField[] = editable.map((column) => ({ key: column.name, label: humanize(column.name), multiline: ['text', 'json', 'jsonb'].includes(column.type) }));
  const primary = ['name', 'title', 'email', 'first_name'].find((key) => editable.some((column) => column.name === key)) || editable[0]?.name || 'id';

  return <EntityCollectionScreen canWrite fields={fields} path={`/admin/${encodeURIComponent(table)}`} primary={primary} renderEditFooter={table === 'User' ? (record) => <UserPasswordReset record={record} /> : undefined} secondary={editable.map((column) => column.name).filter((key) => key !== primary).slice(0, 2)} subtitle="Audited metadata-driven records" title={humanize(table)} wrapper="record" />;
}

function UserPasswordReset({ record }: { record: EntityRecord }) {
  const theme = useAppTheme();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const reset = useMutation({
    mutationFn: () => endpoints.resetAdminUserPassword(record.id, { password, password_confirmation: confirmation }),
    onSuccess: () => {
      setPassword('');
      setConfirmation('');
      Alert.alert('Password updated', 'The new password is active and mobile sessions were revoked.');
    },
    onError: (error) => Alert.alert('Unable to update password', apiErrorMessage(error)),
  });
  const submit = () => {
    if (password.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    if (password !== confirmation) return Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
    reset.mutate();
  };

  return <View style={[styles.passwordPanel, { borderColor: theme.border }]}>
    <View style={styles.passwordHeading}><View style={[styles.passwordIcon, { backgroundColor: theme.surfaceMuted }]}><KeyRound color={theme.warning} size={20} /></View><View style={styles.passwordCopy}><Text style={[styles.passwordTitle, { color: theme.text }]}>Set a new password</Text><Text style={[styles.passwordHint, { color: theme.textMuted }]}>No current password or recovery email is required.</Text></View></View>
    <Text style={[styles.label, { color: theme.text }]}>New password</Text><TextInput accessibilityLabel="New password" autoCapitalize="none" autoComplete="new-password" onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={theme.textMuted} secureTextEntry style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={password} />
    <Text style={[styles.label, { color: theme.text }]}>Confirm password</Text><TextInput accessibilityLabel="Confirm password" autoCapitalize="none" autoComplete="new-password" onChangeText={setConfirmation} placeholder="Repeat new password" placeholderTextColor={theme.textMuted} secureTextEntry style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={confirmation} />
    <PrimaryButton disabled={reset.isPending || !password || !confirmation} label={reset.isPending ? 'Updating password...' : 'Set new password'} onPress={submit} />
  </View>;
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  passwordPanel: { borderTopWidth: StyleSheet.hairlineWidth, gap: 9, marginTop: 6, paddingTop: 20 },
  passwordHeading: { alignItems: 'center', flexDirection: 'row', marginBottom: 5 },
  passwordIcon: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', marginRight: 11, width: 42 },
  passwordCopy: { flex: 1 },
  passwordTitle: { fontSize: 15, fontWeight: '800' },
  passwordHint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 5 },
  field: { borderRadius: 8, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 },
});
