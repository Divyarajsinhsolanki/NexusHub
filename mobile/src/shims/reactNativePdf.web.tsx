import { StyleSheet, Text, View } from 'react-native';

export default function PdfWebFallback({ style }: { style?: object }) {
  return <View style={[styles.fallback, style]}><Text style={styles.title}>PDF preview is available in the Android and iOS development builds.</Text></View>;
}

const styles = StyleSheet.create({ fallback: { alignItems: 'center', backgroundColor: '#373b42', justifyContent: 'center', padding: 24 }, title: { color: '#ffffff', fontSize: 14, lineHeight: 21, maxWidth: 320, textAlign: 'center' } });
