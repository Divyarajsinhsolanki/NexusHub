import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export function Avatar({ name, uri, color = '#475569', size = 40 }: { name: string; uri?: string | null; color?: string; size?: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasValidUri = Boolean(uri && uri !== 'null' && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [uri]);

  if (hasValidUri && uri) {
    return <Image accessibilityLabel={`${name} profile picture`} onError={() => setImageFailed(true)} source={{ uri }} style={{ borderRadius: size / 2, height: size, width: size }} />;
  }

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View accessibilityLabel={`${name} initials`} style={[styles.fallback, { backgroundColor: color, borderRadius: size / 2, height: size, width: size }]}>
      <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#ffffff', fontWeight: '800' },
});
