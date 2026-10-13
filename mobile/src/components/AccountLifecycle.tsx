import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, Text, TextInput, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../theme';

export function AccountLifecycle() {
  const theme = useAppTheme();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['account-lifecycle'], queryFn: endpoints.accountStatus, staleTime: 0 });
  const status = query.data;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [successor, setSuccessor] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void client.invalidateQueries({ queryKey: ['account-lifecycle'] });
    });
    return () => subscription.remove();
  }, [client]);
  const mutation = useMutation({
    mutationFn: (action: 'code' | 'schedule' | 'cancel') => action === 'code' ? endpoints.requestDeletionCode() : action === 'cancel' ? endpoints.cancelAccountDeletion() : endpoints.scheduleAccountDeletion({ verification_code: code, confirmation, successor_id: successor }),
    onSuccess: data => { client.setQueryData(['account-lifecycle'], data); setCode(''); setConfirmation(''); },
    onError: error => Alert.alert('Unable to update deletion request', apiErrorMessage(error)),
  });
  const exportData = async () => {
    setExporting(true);
    let cleanup: (() => void) | undefined;
    try {
      const data = await endpoints.accountExport();
      const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device. Export from the web app.');
      const file = new File(Paths.cache, `nexus-account-export-${Date.now()}.json`);
      cleanup = () => { if (file.exists) file.delete(); };
      file.create(); file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your account export' });
    } catch (error) { Alert.alert('Export unavailable', apiErrorMessage(error)); }
    finally { cleanup?.(); setExporting(false); }
  };
  const busy = mutation.isPending || exporting;
  const text = { color: theme.textMuted, fontSize: 13, lineHeight: 20 };
  const field = { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, color: theme.text, backgroundColor: theme.surfaceMuted };
  return <View style={{ marginTop: 20, gap: 12, padding: 16, borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.surface }}>
    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>Account data and deletion</Text>
    <Text style={text}>Export your data before deleting your account. Verify by email, then cancel during the seven-day waiting period.</Text>
    {status && <Text style={text}>{status.retention}</Text>}
    <PrimaryButton label={exporting ? 'Exporting...' : 'Export my data'} disabled={busy} onPress={() => void exportData()} />
    {query.isError && <><Text accessibilityRole="alert" style={text}>Could not load account controls.</Text><PrimaryButton label="Retry account controls" onPress={() => void query.refetch()} /></>}
    {status?.status === 'scheduled' ? <>
      <Text style={text}>Deletion scheduled for {new Date(status.delete_after!).toLocaleString()}. Reference: {status.receipt_id}</Text>
      <PrimaryButton label="Cancel account deletion" disabled={busy} onPress={() => mutation.mutate('cancel')} />
    </> : <>
      <PrimaryButton label="Delete Account" disabled={busy || !status?.can_delete} onPress={() => setOpen(!open)} />
      {open && <>
        {status?.failure_reason && <Text accessibilityRole="alert" style={text}>{status.failure_reason}</Text>}
        <Text style={text}>Ownership transfers happen immediately. Cancelling deletion does not undo them.</Text>
        {status?.needs_transfer && <>
          <Text style={text}>Transfer shared ownership to an active workspace member:</Text>
          {status.successors.map(member => <Pressable key={member.id} accessibilityRole="radio" accessibilityState={{ selected: successor === member.id }} onPress={() => setSuccessor(member.id)} style={field}><Text style={{ color: theme.text }}>{successor === member.id ? '● ' : '○ '}{member.name}</Text></Pressable>)}
          {!status.successors.length && <Text style={text}>Add another active workspace member before deleting your account.</Text>}
        </>}
        <PrimaryButton label="Send verification code" disabled={busy} onPress={() => mutation.mutate('code')} />
        {status?.status === 'verification_pending' && <>
          <Text style={text}>Email verification code</Text>
          <TextInput accessibilityLabel="Email verification code" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} style={field} value={code} onChangeText={setCode} />
          <Text style={text}>Type DELETE to confirm</Text>
          <TextInput accessibilityLabel="Type DELETE to confirm" autoCapitalize="characters" style={field} value={confirmation} onChangeText={setConfirmation} />
          <PrimaryButton label="Confirm account deletion" disabled={busy || !/^\d{6}$/.test(code) || confirmation !== 'DELETE' || (status.needs_transfer && !successor)} onPress={() => mutation.mutate('schedule')} />
        </>}
      </>}
    </>}
  </View>;
}
