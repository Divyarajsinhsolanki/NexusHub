import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme';

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (value: T) => void }) {
  const theme = useAppTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.container, { backgroundColor: theme.surfaceMuted }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: selected ? theme.text : theme.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 7, flexDirection: 'row', height: 44, padding: 3 },
  option: { alignItems: 'center', borderColor: 'transparent', borderRadius: 5, borderWidth: 1, flex: 1, justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700' },
});
