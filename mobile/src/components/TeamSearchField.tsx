import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAppTheme } from '../theme';

export function TeamSearchField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const theme = useAppTheme();
  return <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Search color={theme.textMuted} size={18} />
    <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={theme.textMuted} value={value} onChangeText={onChange} autoCorrect={false} returnKeyType="search" style={[styles.input, { color: theme.text }]} />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} onPress={() => onChange('')} style={styles.clear}><X color={theme.textMuted} size={18} /></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginHorizontal: 20, marginTop: 14, paddingLeft: 12 },
  input: { flex: 1, fontSize: 14, minHeight: 48, paddingHorizontal: 9 },
  clear: { alignItems: 'center', justifyContent: 'center', height: 48, width: 44 },
});
