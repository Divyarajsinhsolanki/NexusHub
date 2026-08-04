import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, FolderKanban, Inbox, LayoutDashboard, Menu } from 'lucide-react-native';
import { Tabs } from 'expo-router';

import { endpoints } from '@/src/api/endpoints';
import { mobileQueryKeys } from '@/src/cache/mobileCache';
import { useAppTheme } from '@/src/theme';

export default function TabLayout() {
  const theme = useAppTheme();
  const home = useQuery({ queryKey: mobileQueryKeys.home, queryFn: endpoints.home });
  const unread = home.data?.summary.unread_notifications;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarBadgeStyle: {
          backgroundColor: theme.danger,
          color: '#ffffff',
          fontSize: 10,
          fontWeight: '800',
        },
        tabBarIconStyle: { marginTop: 1 },
        tabBarItemStyle: {
          borderRadius: 8,
          marginHorizontal: 2,
          paddingVertical: 3,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          elevation: 8,
          height: 70,
          paddingBottom: 9,
          paddingTop: 7,
          shadowColor: theme.shadow,
          shadowOffset: { height: -3, width: 0 },
          shadowOpacity: 0.12,
          shadowRadius: 10,
        },
      }}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, focused, size }) => <LayoutDashboard color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.6 : 2.1} /> }} />
      <Tabs.Screen name="work" options={{ title: 'Work', tabBarIcon: ({ color, focused, size }) => <BriefcaseBusiness color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.6 : 2.1} /> }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: ({ color, focused, size }) => <FolderKanban color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.6 : 2.1} /> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined, tabBarIcon: ({ color, focused, size }) => <Inbox color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.6 : 2.1} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, focused, size }) => <Menu color={color} size={focused ? size + 2 : size} strokeWidth={focused ? 2.6 : 2.1} /> }} />
    </Tabs>
  );
}
