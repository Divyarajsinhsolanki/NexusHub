import { useNetInfo } from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

export function OfflineBanner() {
  const network = useNetInfo();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  if (!offline) return null;

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <WifiOff color="#ffffff" size={16} />
      <Text style={styles.text}>Offline. Changes are unavailable until you reconnect.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: '#9a3412',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
  },
  text: { color: '#ffffff', flexShrink: 1, fontSize: 12, fontWeight: '600' },
});
