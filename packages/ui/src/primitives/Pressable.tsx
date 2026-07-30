import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
  type AccessibilityRole,
} from 'react-native';
import { color, layout } from '@sc/tokens';

/**
 * Buffer added on every side so a visually smaller control still meets the
 * design's 44px minimum touch target — see layout.minTouchTarget. This is a
 * floor, not a substitute for sizing the control itself: a control whose
 * visual box is already >= 44 doesn't need it, but nothing in this app is
 * allowed to ship BELOW 44 including the invisible slop.
 */
const DEFAULT_HIT_SLOP = 8;

export interface PressableProps extends Omit<RNPressableProps, 'style'> {
  /**
   * Required, not defaulted: every interactive element needs an explicit role
   * for screen readers, and a silently-defaulted 'button' would be wrong for
   * e.g. a tab or a radio card.
   */
  accessibilityRole: AccessibilityRole;
  /** Tints the pressed-state overlay for the dark screens (searching, trip Live pill). */
  onDark?: boolean;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
}

/**
 * The only way a tappable surface is built in this app (raw Pressable /
 * TouchableOpacity from react-native are banned outside @sc/ui by lint). Every
 * instance gets the pressed-state overlay from the design (`color-mix(...,
 * 8%)`, precomputed in @sc/tokens) and a minimum hit slop, so neither has to
 * be reimplemented — or forgotten — at each call site.
 */
export function Pressable({
  onDark,
  disabled,
  hitSlop = DEFAULT_HIT_SLOP,
  style,
  ...props
}: PressableProps) {
  const pressedOverlay = onDark ? color.pressedOnDark : color.pressedOnLight;
  // RN's own `disabled` prop is typed `boolean | null | undefined` (null is
  // allowed for some Animated interpolation cases); AccessibilityState.disabled
  // only accepts boolean | undefined, so null needs collapsing here.
  const isDisabled = disabled ?? undefined;

  return (
    <RNPressable
      {...props}
      disabled={isDisabled}
      hitSlop={hitSlop}
      accessibilityState={{ ...props.accessibilityState, disabled: isDisabled }}
      style={(state) => {
        const base: ViewStyle = state.pressed ? { backgroundColor: pressedOverlay } : {};
        const rest = typeof style === 'function' ? style(state) : style;
        return [base, rest];
      }}
    />
  );
}

/** Re-exported so call sites can reach for it without importing @sc/tokens directly. */
export const minTouchTarget = layout.minTouchTarget;
