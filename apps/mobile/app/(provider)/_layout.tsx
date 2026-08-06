import { Tabs } from 'expo-router';
import { ClipboardList, MessageCircle, Store, Wallet, User } from 'lucide-react-native';
import { FloatingTabBar, type FloatingTabBarProps } from '@sc/ui';

/**
 * Stylist tab bar: Jobs · Shop · Messages · Earnings · My page.
 *
 * Shop, Messages and Earnings are deliberately the same screens the client
 * side uses (buying supplies, a conversation, the coin ledger are the same
 * thing on either side of one account) — re-exports, not copies, so the two
 * can never drift. My page is the same account screen /profile is.
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
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color: iconColor, size }) => (
            <Store color={iconColor} size={size} strokeWidth={1.8} />
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
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: ({ color: iconColor, size }) => (
            <Wallet color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My page',
          tabBarIcon: ({ color: iconColor, size }) => (
            <User color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
