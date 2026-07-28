import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, FolderKanban, Inbox, LayoutDashboard, Menu } from 'lucide-react-native';
import { Tabs } from 'expo-router';

import { endpoints } from '@/src/api/endpoints';
import { useAppTheme } from '@/src/theme';

export default function TabLayout() {
  const theme = useAppTheme();
  const home = useQuery({ queryKey: ['home'], queryFn: endpoints.home });
  const unread = home.data?.summary.unread_notifications;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          height: 68,
          paddingBottom: 9,
          paddingTop: 7,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="work" options={{ title: 'Work', tabBarIcon: ({ color, size }) => <BriefcaseBusiness color={color} size={size} /> }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: ({ color, size }) => <FolderKanban color={color} size={size} /> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined, tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
    </Tabs>
  );
}
