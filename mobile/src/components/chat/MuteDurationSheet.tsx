import { Modal, Pressable, Text, View } from 'react-native';
import { MUTE_OPTIONS, type MuteDuration } from '../../chat/muteOptions';
import { useAppTheme } from '../../theme';
export function MuteDurationSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (duration: MuteDuration) => void }) {
  const theme = useAppTheme();
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}><Pressable accessibilityLabel="Close mute options" onPress={onClose} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000066' }}><View accessibilityViewIsModal onStartShouldSetResponder={() => true} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 20 }}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Mute notifications for…</Text>{MUTE_OPTIONS.map(option => <Pressable accessibilityRole="button" key={option.id} onPress={() => onSelect(option.id)} style={{ paddingVertical: 14 }}><Text style={{ color: theme.text }}>{option.label}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={onClose} style={{ paddingVertical: 14 }}><Text style={{ color: theme.primary }}>Cancel</Text></Pressable></View></Pressable></Modal>;
}
