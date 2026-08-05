import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { color, layout, space } from '@sc/tokens';
import { scIn } from '../motion/index.js';
import {
  resolveHeaderTopPadding,
  resolveFooterBottomPadding,
  resolveTabBarBottomPadding,
} from './screenPadding.js';

export type ScreenTheme = 'light' | 'dark' | 'accent';

const THEME_BACKGROUND: Record<ScreenTheme, string> = {
  light: color.bg,
  dark: color.neutral900,
  accent: color.accent,
};

/** expo-status-bar's `style` names the CONTENT colour, not the background. */
const STATUS_BAR_CONTENT: Record<ScreenTheme, 'dark' | 'light'> = {
  light: 'dark',
  dark: 'light',
  accent: 'light',
};

const HEADER_BORDER_COLOR: Record<ScreenTheme, string> = {
  light: color.divider,
  accent: color.divider,
  dark: color.onDark.border,
};

export interface ScreenProps {
  theme?: ScreenTheme;
  /**
   * A FIXED slot above the scrolling body — the handoff's header row is
   * `flex:none` while the content below it is the thing that scrolls
   * (`.sc-scroll`); they are not one scrolling column. Gets the safe-area top
   * padding and horizontal padding automatically. Most screens pass a
   * <ScreenHeader>; Home's wordmark/role-chip header and the full-accent
   * screens (no header at all) pass something else, or omit it.
   */
  header?: ReactNode;
  /** Border under the header — on for every screen with a header except where the design omits it. */
  headerBordered?: boolean;
  /** Reserves bottom space for the floating tab bar. Mutually exclusive with `footer`. */
  hasTabBar?: boolean;
  /** A FIXED sticky footer (the design's border-top action row) below the scrolling body. */
  footer?: ReactNode;
  /** false for screens that manage their own scrolling/layout (e.g. the map screens). */
  scroll?: boolean;
  /**
   * A `<RefreshControl>` for pull-to-refresh. Screen owns the ScrollView, so
   * a screen cannot attach one itself — and a list of bookings is exactly
   * where a user's reflex is to pull down.
   */
  refreshControl?: ScrollViewProps['refreshControl'];
  /** Plays the scIn enter animation. Off for screens replaced via router.replace, where a re-entrance animation would be visually wrong (e.g. Bookings after Booked). */
  enter?: boolean;
  contentStyle?: ViewStyle | ViewStyle[];
  children: ReactNode;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flexOne: { flex: 1 },
  headerBorder: { borderBottomWidth: 1 },
  footerBorder: { borderTopWidth: 1 },
});

/**
 * Owns everything every screen in the handoff shares: background per theme,
 * status bar content colour, the fixed-header / scrolling-body / fixed-footer
 * layout, safe-area-aware padding (see screenPadding.ts), horizontal 20px
 * padding, and the scIn enter animation. No screen should set its own
 * top-level background, StatusBar, or safe-area padding.
 */
export function Screen({
  theme = 'light',
  header,
  headerBordered = true,
  hasTabBar = false,
  footer,
  scroll = true,
  refreshControl,
  enter = true,
  contentStyle,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const rootStyle: ViewStyle = { backgroundColor: THEME_BACKGROUND[theme] };

  const headerStyle: ViewStyle = {
    paddingTop: resolveHeaderTopPadding(insets.top),
    paddingHorizontal: layout.screenX,
    paddingBottom: space.s,
    borderBottomColor: HEADER_BORDER_COLOR[theme],
  };

  // Content padding: top clears the safe area only when there is no fixed
  // header to do that job already; bottom reserves space for whichever fixed
  // bottom element (tab bar, footer, or neither) the screen has.
  const contentPadding: ViewStyle = {
    paddingTop: header ? space.xl : resolveHeaderTopPadding(insets.top),
    paddingHorizontal: layout.screenX,
    paddingBottom: footer
      ? space.l
      : hasTabBar
        ? resolveTabBarBottomPadding()
        : resolveFooterBottomPadding(insets.bottom),
  };

  const footerStyle: ViewStyle = {
    paddingHorizontal: layout.screenX,
    paddingTop: space.ml,
    paddingBottom: resolveFooterBottomPadding(insets.bottom),
    borderTopColor: color.divider,
  };

  const body = (
    <View style={[contentPadding, !scroll ? styles.flexOne : null, contentStyle]}>{children}</View>
  );

  const Root = enter ? Animated.View : View;
  const enteringProp = enter ? { entering: scIn() } : {};

  return (
    <Root style={[styles.root, rootStyle]} {...enteringProp}>
      <StatusBar style={STATUS_BAR_CONTENT[theme]} />
      {header ? (
        <View style={[headerStyle, headerBordered ? styles.headerBorder : null]}>{header}</View>
      ) : null}
      {scroll ? (
        <ScrollView
          style={styles.flexOne}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flexOne}>{body}</View>
      )}
      {footer ? <View style={[styles.footerBorder, footerStyle]}>{footer}</View> : null}
    </Root>
  );
}
