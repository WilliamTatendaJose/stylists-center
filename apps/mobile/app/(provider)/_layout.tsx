import { Tabs } from 'expo-router';
import { ClipboardList, MessageCircle } from 'lucide-react-native';
import { FloatingTabBar, type FloatingTabBarProps } from '@sc/ui';

/**
 * Stylist tab bar. The client layout has always noted that provider tabs
 * (Jobs · Shop · Messages · Earnings · My page) belong in their own route
 * group — this is that group, starting with the two tabs the Jobs slice
 * needs. Shop, Earnings and My page join it as those slices land.
 *
 * Messages is deliberately the same screen the client side uses: a
 * conversation has two ends and neither is special, so duplicating it would
 * mean maintaining the same chat twice.
 */
export default function ProviderTabsLayout() {
  return (
    <Tabs
      // Same assertion, and the same reason, as the client layout: @sc/ui's
      // FloatingTabBar is deliberately decoupled from expo-router's generic
      // navigation types.
      tabBar={(props) => <FloatingTabBar {...(props as unknown as FloatingTabBarProps)} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color: iconColor, size }) => (
            <ClipboardList color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color: iconColor, size }) => (
            <MessageCircle color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
