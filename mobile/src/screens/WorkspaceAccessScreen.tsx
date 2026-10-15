import { Picker } from '@react-native-picker/picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EntityRecord, OffboardingPreview, WorkspaceMembership } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useAppTheme } from '../theme';

export function WorkspaceAccessScreen() {
  const theme = useAppTheme();
  const { user, signOut } = useAuth();
  const client = useQueryClient();
  const allowed = !user?.demo_account && !!user?.permissions?.includes('invitations.manage');
  const owner = allowed && !!user?.permissions?.includes('offboarding.manage');
  const invitations = useQuery({ queryKey: ['workspace-invitations'], queryFn: endpoints.workspaceInvitations, enabled: allowed });
  const people = useQuery({ queryKey: ['users', 'offboarding'], queryFn: () => endpoints.users(), enabled: owner });
  const roles = useQuery({ queryKey: ['roles', 'invitation'], queryFn: () => endpoints.rawResource<string[]>('/roles'), enabled: allowed });
  const [email, setEmail] = useState(''), [role, setRole] = useState('member'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [employee, setEmployee] = useState<EntityRecord | null>(null), [preview, setPreview] = useState<OffboardingPreview | null>(null), [successor, setSuccessor] = useState(''), [confirmation, setConfirmation] = useState('');
  const run = async (action: () => Promise<unknown>, success: string) => { setBusy(true); setMessage(''); try { await action(); setMessage(success); await client.invalidateQueries({ queryKey: ['workspace-invitations'] }); await client.invalidateQueries({ queryKey: ['users'] }); } catch (error) { setMessage(apiErrorMessage(error)); } finally { setBusy(false); } };
  const start = async (record: EntityRecord) => { setBusy(true); setMessage(''); setPreview(null); setConfirmation(''); setSuccessor(''); try { const member = record.workspace_membership as WorkspaceMembership; setPreview(await endpoints.previewWorkspaceOffboarding(member.id)); setEmployee(record); } catch (error) { setMessage(apiErrorMessage(error)); } finally { setBusy(false); } };
  const offboard = async () => { if (!employee) return; const member = employee.workspace_membership as WorkspaceMembership; await run(async () => { const receipt = await endpoints.offboardWorkspaceMember(member.id, { confirmation, successor_id: successor ? Number(successor) : null }); if (employee.id === user?.id) await signOut(); setEmployee(null); setPreview(null); setConfirmation(''); return receipt; }, 'Workspace access removed; history retained. Check the web People page for any pending call cleanup.'); };
  const input = { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, color: theme.text, backgroundColor: theme.surface };
  return <Screen><PageHeader title="Invitations and offboarding" subtitle="Company access and retained history" /><ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
    {!allowed ? <Text style={{color:theme.text}}>Invitation management access is required.</Text> : <>
      <Text style={{color:theme.text}}>Invite a teammate with a seven-day email link. They choose their own password.</Text>
      <TextInput accessibilityLabel="Invitation email" placeholder="Email address" placeholderTextColor={theme.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={input} />
      <Text style={{color:theme.text}}>Workspace role</Text><Picker accessibilityLabel="Invitation role" selectedValue={role} onValueChange={setRole} style={{color:theme.text}}>{(roles.data || ['member']).map(name=><Picker.Item key={name} label={name.replaceAll('_',' ')} value={name} />)}</Picker>
      <PrimaryButton label="Send invitation" loading={busy} disabled={busy || !email.trim()} onPress={() => run(async () => { const result=await endpoints.inviteWorkspaceMember({email:email.trim(),role_names:[role]}); setEmail(''); return result; }, 'Invitation created; email delivery is queued.')} />
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Pending invitations</Text>
      {invitations.isPending && <Text style={{color:theme.textMuted}}>Loading invitations…</Text>}
      {invitations.isError && <Text accessibilityRole="alert" style={{color:theme.danger}}>Invitations could not be loaded.</Text>}
      {invitations.data?.data.filter(item=>['pending','expired'].includes(item.status)).map(item=><View key={item.id} style={{gap:8,paddingVertical:10}}><Text style={{color:theme.text,fontWeight:'700'}}>{item.email}</Text><Text style={{color:theme.textMuted}}>{item.status} · Email {item.delivery_status} · {item.roles.join(', ')}</Text><PrimaryButton label={`Resend invitation to ${item.email}`} disabled={busy} onPress={()=>run(()=>endpoints.resendWorkspaceInvitation(item.id),'Invitation resent; the old link is invalid.')} /><PrimaryButton label={`Revoke invitation to ${item.email}`} disabled={busy} onPress={()=>run(()=>endpoints.revokeWorkspaceInvitation(item.id),'Invitation revoked.')} /></View>)}
      {owner && <><Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Offboard an employee</Text>{people.data?.data.map(record=><View key={record.id} style={{gap:8,paddingVertical:10}}><Text style={{color:theme.text}}>{String(record.name || record.first_name || record.email)}</Text><PrimaryButton label={`Review offboarding for ${String(record.name || record.first_name || record.email)}`} disabled={busy} onPress={()=>start(record)} /></View>)}</>}
      {preview && employee && <View style={{gap:12,borderWidth:1,borderColor:theme.border,padding:16,borderRadius:12}}><Text style={{color:theme.text,fontWeight:'700'}}>Offboard {preview.name}</Text><Text style={{color:theme.text}}>{preview.retained}</Text>{preview.needs_transfer && <><Text style={{color:theme.text}}>Transfer ownership to</Text><Picker accessibilityLabel="Offboarding successor" selectedValue={successor} onValueChange={setSuccessor} style={{color:theme.text}}><Picker.Item label="Choose an active teammate" value="" />{preview.successors.map(item=><Picker.Item key={item.id} label={item.name} value={String(item.id)} />)}</Picker></>}
        <TextInput accessibilityLabel="Type OFFBOARD to confirm" placeholder="Type OFFBOARD to confirm" placeholderTextColor={theme.textMuted} value={confirmation} onChangeText={setConfirmation} style={input} />
        <PrimaryButton label="Offboard employee" loading={busy} disabled={busy || confirmation!=='OFFBOARD' || (preview.needs_transfer && !successor)} onPress={offboard} /><PrimaryButton label="Cancel offboarding" disabled={busy} onPress={()=>{setEmployee(null);setPreview(null);}} /></View>}
      {!!message && <Text accessibilityRole="alert" style={{color:theme.text}}>{message}</Text>}
    </>}
  </ScrollView></Screen>;
}
