import { Tabs } from 'expo-router';
import { Search, Store, CalendarCheck, MessageCircle, Wallet } from 'lucide-react-native';
import { FloatingTabBar, type FloatingTabBarProps } from '@sc/ui';

/**
 * Client tab bar (handoff: Find · Market · Bookings · Messages · Wallet).
 * Provider tabs (Jobs · Shop · Messages · Earnings · My page) are a separate
 * route group in a later milestone — this app is client-only for M1.
 *
 * The floating pill bar itself is @sc/ui's FloatingTabBar; this layout only
 * supplies the per-tab title/icon, which is the generic BottomTabBarProps
 * contract FloatingTabBar was built against.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        // React Navigation's real BottomTabBarProps has a generic
        // `navigation.emit<EventName extends keyof EventMap>` whose parameter
        // type is a conditional type keyed off the event name — that shape
        // cannot be captured by @sc/ui's deliberately simple, expo-router-
        // decoupled structural interface (see FloatingTabBar.tsx), and no
        // amount of widening the structural type closes that gap without
        // reintroducing the dependency this interface exists to avoid. `props`
        // is structurally a superset in every field this component actually
        // reads or calls (state.routes/index, descriptors[key].options,
        // navigation.navigate, and emit called only with the literal
        // 'tabPress'), so the assertion is safe at this single, well-defined
        // boundary rather than the type being wrong.
        <FloatingTabBar {...(props as unknown as FloatingTabBarProps)} />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Find',
          tabBarIcon: ({ color: iconColor, size }) => (
            <Search color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color: iconColor, size }) => (
            <Store color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color: iconColor, size }) => (
            <CalendarCheck color={iconColor} size={size} strokeWidth={1.8} />
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
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color: iconColor, size }) => (
            <Wallet color={iconColor} size={size} strokeWidth={1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
