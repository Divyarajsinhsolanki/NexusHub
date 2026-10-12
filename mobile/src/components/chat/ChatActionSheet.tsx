import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';

export function ChatActionSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.header}><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={styles.close}><X color={theme.text} size={22} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}
export function ChatSheetAction({ label, onPress, danger, disabled, children }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; children?: ReactNode }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, { borderBottomColor: theme.border, backgroundColor: pressed ? theme.surfaceMuted : 'transparent', opacity: disabled ? 0.45 : 1 }]}>{children}<Text style={{ color: danger ? theme.danger : theme.text, fontWeight: '600', fontSize: 15 }}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }, sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, maxHeight: '85%' }, handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }, title: { flex: 1, fontSize: 17, fontWeight: '800' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, content: { paddingBottom: 8 }, action: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, borderRadius: 8 } });
