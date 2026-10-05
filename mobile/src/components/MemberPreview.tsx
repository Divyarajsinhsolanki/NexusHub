import { ReactNode, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X, Mail, Phone, ExternalLink } from 'lucide-react-native';
import { useAppTheme } from '../theme';
import { absoluteAssetUrl } from '../api/client';
import { Avatar } from './Avatar';

export function MemberPreview({ member, children }: { member: object; children: ReactNode }) {
  const person = member as Record<string, unknown>;
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const name = String(person.name || person.full_name || person.email || 'Team member');
  const uri = absoluteAssetUrl(String(person.profile_picture || person.profile_picture_url || ''));
  const contact = (value: unknown, prefix: string) => { if (value) Linking.openURL(`${prefix}:${String(value)}`).catch(() => {}); };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${name}'s profile`} onPress={(event) => { event.stopPropagation(); setOpen(true); }} hitSlop={6}>{children}</Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Dismiss profile preview" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.panel, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
          <View style={styles.header}><Avatar name={name} uri={uri} size={56} color={theme.primary} /><View style={styles.copy}><Text style={[styles.title, { color: theme.text }]}>{name}</Text><Text style={{ color: theme.textMuted }}>{String(person.job_title || person.role || 'Team member').replaceAll('_', ' ')}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close profile preview" onPress={() => setOpen(false)} style={styles.close}><X color={theme.textMuted} size={22} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.details}>
            {!!person.department_name && <Text style={{ color: theme.textMuted }}>{String(person.department_name)}</Text>}
            {!!person.email && <Pressable accessibilityRole="link" accessibilityLabel={`Email ${name}`} onPress={() => contact(person.email, 'mailto')} style={styles.contact}><Mail color={theme.primary} size={18} /><Text style={[styles.copy, { color: theme.primary }]}>{String(person.email)}</Text></Pressable>}
            {!!(person.phone_number || person.phone) && <Pressable accessibilityRole="link" accessibilityLabel={`Call ${name}`} onPress={() => contact(person.phone_number || person.phone, 'tel')} style={styles.contact}><Phone color={theme.primary} size={18} /><Text style={{ color: theme.primary }}>{String(person.phone_number || person.phone)}</Text></Pressable>}
            {typeof person.allocation_percentage === 'number' && <Text style={{ color: theme.textMuted }}>Allocation: {person.allocation_percentage}%</Text>}
            {!!person.workload_status && <Text style={{ color: theme.textMuted }}>Workload: {String(person.workload_status)}</Text>}
            {!!person.bio && <Text style={[styles.bio, { color: theme.textMuted }]}>{String(person.bio)}</Text>}
            {person.id != null && process.env.EXPO_PUBLIC_WEB_URL && <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '')}/profile/${person.id}`).catch(() => {})} style={[styles.contact, { backgroundColor: theme.primarySoft, padding: 12, borderRadius: 12 }]}><ExternalLink color={theme.primary} size={18} /><Text style={{ color: theme.primary, fontWeight: '700' }}>View full profile</Text></Pressable>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.45)', justifyContent: 'center', padding: 24 }, panel: { maxHeight: '80%', width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 22, borderWidth: 1, padding: 20 }, header: { flexDirection: 'row', gap: 12, alignItems: 'center' }, copy: { flex: 1 }, title: { fontSize: 19, fontWeight: '800', marginBottom: 4 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, details: { gap: 14, paddingTop: 20 }, contact: { minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center' }, bio: { fontSize: 14, lineHeight: 22 } });
