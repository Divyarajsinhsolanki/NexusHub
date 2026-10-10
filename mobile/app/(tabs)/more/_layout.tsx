import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { canOpenMoreFeature } from '@/src/navigation/featureAccess';

export default function MoreLayout() {
  const { user } = useAuth();
  const pathname = usePathname();
  const feature = pathname.split('/more/')[1]?.split('/')[0];
  if (feature && !canOpenMoreFeature(user, feature)) return <Redirect href="/more" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
