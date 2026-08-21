import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { ArrowRight, Eye, EyeOff, Globe2, ShieldCheck } from 'lucide-react-native';
import { Pressable, Screen, Text } from '@sc/ui';
import { color, layout, radius, space, type } from '@sc/tokens';

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: 28 },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.bg },
  hero: {
    minHeight: 144,
    borderRadius: radius.hero,
    backgroundColor: color.neutral900,
    overflow: 'hidden',
    padding: space.xl,
    marginBottom: 28,
    justifyContent: 'flex-end',
  },
  heroGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -46,
    top: -66,
    backgroundColor: color.accent,
    opacity: 0.9,
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    right: 54,
    top: 30,
    borderWidth: 1,
    borderColor: color.onDark.borderStrong,
  },
  heroKicker: { marginBottom: space.s },
  title: { marginBottom: space.s },
  subtitle: { marginBottom: space.xl, maxWidth: 330 },
  form: { gap: space.l },
  field: { gap: space.s },
  label: { marginLeft: 2 },
  inputShell: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.tile,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.l,
    paddingRight: space.s,
    backgroundColor: color.bg,
  },
  inputShellError: { borderColor: color.accent700, backgroundColor: color.accent100 },
  input: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 0,
    ...type.bodyLarge,
    color: color.text,
  },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fieldError: { marginLeft: 2 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginVertical: 2 },
  divider: { flex: 1, height: 1, backgroundColor: color.divider },
  google: {
    minHeight: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    backgroundColor: color.bg,
  },
  googleDisabled: { opacity: 0.5 },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    padding: space.m,
    borderRadius: radius.tile,
    backgroundColor: color.surface,
  },
  secureText: { flex: 1 },
  footer: { marginTop: space.xl, gap: space.s },
  actionLink: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
});

export function AuthShell({
  title,
  subtitle,
  children,
  showHero = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showHero?: boolean;
}) {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <View style={styles.brandMarkInner} />
        </View>
        <Text variant="wordmark">STYLISTS CENTER</Text>
      </View>
      {showHero ? (
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroGlowSmall} />
          <Text variant="kicker" color={color.onAccent.labelDim} style={styles.heroKicker}>
            BEAUTY, ON YOUR TERMS
          </Text>
          <Text variant="h3" color={color.onDark.text}>
            Your look, your people.
          </Text>
        </View>
      ) : null}
      <Text variant="h2Small" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodyLarge" color="neutral700" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </Screen>
  );
}

export function AuthField({
  label,
  error,
  secure = false,
  onToggleSecure,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  secure?: boolean;
  onToggleSecure?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text variant="sectionLabel" color="neutral600" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.inputShell, error ? styles.inputShellError : null]}>
        <TextInput
          {...props}
          secureTextEntry={secure}
          placeholderTextColor={color.neutral600}
          style={styles.input}
          accessibilityLabel={label}
        />
        {onToggleSecure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              secure ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`
            }
            onPress={onToggleSecure}
            style={styles.eye}
          >
            {secure ? (
              <Eye size={19} color={color.neutral700} strokeWidth={1.8} />
            ) : (
              <EyeOff size={19} color={color.neutral700} strokeWidth={1.8} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="meta" color="accent700" style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function AuthGoogleButton({
  onPress,
  disabled = false,
}: {
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.google, disabled ? styles.googleDisabled : null]}
    >
      <View style={styles.googleIcon}>
        <Globe2 size={17} color={color.neutral900} strokeWidth={2} />
      </View>
      <Text variant="buttonLabel" color="neutral900">
        Continue with Google
      </Text>
    </Pressable>
  );
}

export function AuthDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.divider} />
      <Text variant="metaSmall" color="neutral600">
        OR CONTINUE WITH EMAIL
      </Text>
      <View style={styles.divider} />
    </View>
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionLink}>
      <Text variant="bodyStrong" color="accent700">
        {label}
      </Text>
    </Pressable>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

export function SecureNote({
  children = 'Your account is protected with Firebase.',
}: {
  children?: string;
}) {
  return (
    <View style={styles.secure}>
      <ShieldCheck size={17} color={color.accent700} strokeWidth={1.9} />
      <Text variant="meta" color="neutral700" style={styles.secureText}>
        {children}
      </Text>
    </View>
  );
}

export function AuthArrowIcon() {
  return <ArrowRight size={17} color={color.accent700} strokeWidth={2} />;
}

export const authStyles: { form: ViewStyle } = { form: styles.form };
