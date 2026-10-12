import { BellOff } from 'lucide-react-native';
import { MUTE_OPTIONS, type MuteDuration } from '../../chat/muteOptions';
import { useAppTheme } from '../../theme';
import { ChatActionSheet, ChatSheetAction } from './ChatActionSheet';
export function MuteOptions({ onClose, onSelect }: { onClose: () => void; onSelect: (duration: MuteDuration) => void }) {
  const theme = useAppTheme();
  return <>{MUTE_OPTIONS.map(option => <ChatSheetAction key={option.id} label={option.label} onPress={() => onSelect(option.id)}><BellOff size={20} color={theme.textMuted} /></ChatSheetAction>)}<ChatSheetAction label="Cancel" onPress={onClose} /></>;
}
export function MuteDurationSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (duration: MuteDuration) => void }) {
  return <ChatActionSheet visible={visible} title="Mute notifications for…" onClose={onClose}><MuteOptions onClose={onClose} onSelect={onSelect} /></ChatActionSheet>;
}
