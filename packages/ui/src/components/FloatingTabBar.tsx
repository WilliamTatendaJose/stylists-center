import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, layout, motion, radius, shadow, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';

/**
 * A minimal structural subset of React Navigation's BottomTabBarProps (which
 * expo-router's <Tabs tabBar={...}> passes through unchanged). Declared
 * locally rather than imported from expo-router — that keeps @sc/ui decoupled
 * from expo-router's internal, unstable `build/react-navigation/...` path;
 * expo-router's real props are a structural superset of this and satisfy it
 * without a cast at the call site.
 */
export interface FloatingTabRoute {
  key: string;
  name: string;
  params?: object;
}
export interface FloatingTabDescriptor {
  options: {
    title?: string;
    // React Navigation's real type also allows a render-function form with a
    // specific props shape; this component never calls that function (only
    // ever uses the string form, since every Tabs.Screen here sets `title`),
    // so the parameter is typed `never` — the bottom type is assignable FROM
    // any real function's parameter type, which is what makes a concrete
    // BottomTabBarProps (whose tabBarLabel takes a specific props shape)
    // structurally satisfy this looser interface. Function parameters are
    // contravariant, so `unknown` here would have been too narrow, not too wide.
    tabBarLabel?: string | ((props: never) => ReactNode);
    tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode;
  };
}
export interface FloatingTabNavigationEvent {
  defaultPrevented: boolean;
}
export interface FloatingTabNavigation {
  emit: (event: {
    type: string;
    target: string;
    canPreventDefault?: boolean;
  }) => FloatingTabNavigationEvent;
  navigate: (name: string, params?: object) => void;
}
export interface FloatingTabBarProps {
  state: { routes: FloatingTabRoute[]; index: number };
  descriptors: Record<string, FloatingTabDescriptor>;
  navigation: FloatingTabNavigation;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    backgroundColor: color.neutral900,
    borderRadius: radius.pill,
    padding: layout.tabBarPadding,
    gap: layout.tabBarGap,
    flexDirection: 'row',
    ...shadow.floatingNav,
  },
  tab: {
    flexBasis: 0,
    height: layout.tabHeight,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  tabInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  label: { overflow: 'hidden' },
});

/**
 * The handoff's floating tab bar: a black pill, five icon-only tabs, the
 * active tab animating flexGrow 1 -> 1.9, filling white and revealing an
 * uppercase label. Consumes BottomTabBarProps generically (title/tabBarIcon
 * per screen) — this component carries no knowledge of which tabs exist;
 * that's configured per-app in the Tabs.Screen options.
 */
export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const barStyle: ViewStyle = {
    left: layout.tabBarSideInset,
    right: layout.tabBarSideInset,
    bottom: Math.max(layout.tabBarBottomInset, insets.bottom + space.s),
  };

  return (
    <View style={[styles.bar, barStyle]}>
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const label =
          (typeof options.tabBarLabel === 'string' ? options.tabBarLabel : undefined) ??
          options.title ??
          route.name;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <FloatingTab
            key={route.key}
            focused={focused}
            label={label}
            onPress={onPress}
            renderIcon={(iconColor) =>
              options.tabBarIcon?.({ focused, color: iconColor, size: 19 })
            }
          />
        );
      })}
    </View>
  );
}

interface FloatingTabProps {
  focused: boolean;
  label: string;
  onPress: () => void;
  renderIcon: (color: string) => ReactNode;
}

function FloatingTab({ focused, label, onPress, renderIcon }: FloatingTabProps) {
  // 0 = inactive (black fill, white icon/label), 1 = active (white fill,
  // accent icon/label, flexGrow 1.9). Driven off `focused` rather than a
  // press gesture — the morph follows route changes, matching the design.
  const progress = useSharedValue(focused ? 1 : 0);
  progress.value = withTiming(focused ? 1 : 0, {
    duration: motion.tab.flex,
    easing: Easing.out(Easing.cubic),
  });

  const containerStyle = useAnimatedStyle(() => ({
    flexGrow: motion.tab.flexFrom + progress.value * (motion.tab.flexTo - motion.tab.flexFrom),
    backgroundColor: interpolateColor(progress.value, [0, 1], [color.neutral900, color.bg]),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxWidth: progress.value * 72,
    marginLeft: progress.value * space.xs,
  }));

  // Icon/label tint doesn't need its own worklet — it only has two states and
  // isn't itself animated position/opacity, just recoloured at the same pace
  // as the container via the shared `focused` boolean.
  const tint = focused ? color.accent : color.bg;

  // The flexGrow/background morph animates on an Animated.View (a plain host
  // component Reanimated can drive directly); the actual touch target is a
  // regular @sc/ui Pressable filling it. Animating the Pressable itself would
  // need createAnimatedComponent + forwardRef plumbing this component doesn't
  // have, for no visual benefit — the View is what's changing shape, not the
  // touch handling.
  return (
    <Animated.View style={[styles.tab, containerStyle]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        onDark
        style={styles.tabInner}
      >
        {renderIcon(tint)}
        <Animated.View style={labelStyle}>
          <Text variant="tabLabel" color={tint} numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
