import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Mail, ShieldCheck } from 'lucide-react-native';
import { space } from '@sc/tokens';
import { Button, Card, Sheet, Text, useTheme } from '@sc/ui';
import { AuthField } from './AuthChrome.js';
import { ProfileInfoRow, ProfileSection } from './ProfileChrome.js';
import {
  changePassword,
  firebaseErrorMessage,
  sendPasswordReset,
  signInMethod,
} from '../auth/firebaseAuth.js';

const MIN_PASSWORD_LENGTH = 8;

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.l },
  note: { paddingVertical: space.l },
  actions: { gap: space.s, marginTop: space.m },
  status: { marginTop: space.s },
  sheetTitle: { marginBottom: space.s },
  sheetBody: { marginBottom: space.l },
  sheetError: { marginBottom: space.m },
  fields: { gap: space.m, marginBottom: space.l },
});

/**
 * Password management for the signed-in account: change it (current password
 * required), or have a reset link emailed. Accounts that sign in only with
 * Google have no password here, so they get a note pointing to Google instead.
 */
export function PasswordSecurity({ email }: { email: string | null }) {
  const { colors } = useTheme();
  const method = signInMethod();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hidden, setHidden] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  if (!email) return null;

  if (method === 'google') {
    return (
      <ProfileSection label="Password & security">
        <Card bordered style={styles.card}>
          <ProfileInfoRow
            icon={<ShieldCheck size={20} color={colors.neutral700} />}
            label="Sign-in method"
            value="Google"
          />
          <Text variant="meta" color="neutral700" style={styles.note}>
            You sign in with your Google account, so there is no Style Center password to change.
            Manage your password in your Google account settings.
          </Text>
        </Card>
      </ProfileSection>
    );
  }

  const openSheet = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setHidden(true);
    setSheetError(null);
    setSheetOpen(true);
  };

  const save = async () => {
    if (next.length < MIN_PASSWORD_LENGTH) {
      setSheetError(
        `Use at least ${String(MIN_PASSWORD_LENGTH)} characters for your new password.`,
      );
      return;
    }
    if (next !== confirm) {
      setSheetError("The new passwords don't match.");
      return;
    }
    if (next === current) {
      setSheetError('Choose a new password that is different from your current one.');
      return;
    }
    setSaving(true);
    setSheetError(null);
    try {
      await changePassword(email, current, next);
      setSheetOpen(false);
      setStatus('Password changed. Use your new password next time you sign in.');
    } catch (reason) {
      setSheetError(firebaseErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const emailReset = async () => {
    setSendingReset(true);
    setStatus(null);
    try {
      await sendPasswordReset(email);
      setStatus(`We sent a password reset link to ${email}. It may take a minute to arrive.`);
    } catch (reason) {
      setStatus(firebaseErrorMessage(reason));
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <>
      <ProfileSection label="Password & security">
        <Card bordered style={styles.card}>
          <ProfileInfoRow
            icon={<Mail size={20} color={colors.neutral700} />}
            label="Sign-in email"
            value={email}
          />
        </Card>
        <View style={styles.actions}>
          <Button label="Change password" variant="secondary" block onPress={openSheet} />
          <Button
            label={sendingReset ? 'Sending…' : 'Email me a reset link'}
            variant="ghost"
            block
            disabled={sendingReset}
            onPress={() => void emailReset()}
          />
        </View>
        {status ? (
          <Text
            variant="meta"
            color="neutral700"
            style={styles.status}
            accessibilityLiveRegion="polite"
          >
            {status}
          </Text>
        ) : null}
      </ProfileSection>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text variant="cardTitle" style={styles.sheetTitle}>
          Change password
        </Text>
        <Text variant="body" color="neutral700" style={styles.sheetBody}>
          Enter your current password, then choose a new one of at least{' '}
          {String(MIN_PASSWORD_LENGTH)} characters.
        </Text>
        {sheetError ? (
          <Text
            variant="meta"
            color={colors.accent700}
            style={styles.sheetError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {sheetError}
          </Text>
        ) : null}
        <View style={styles.fields}>
          <AuthField
            label="Current password"
            value={current}
            onChangeText={(value) => {
              setCurrent(value);
              setSheetError(null);
            }}
            secure={hidden}
            onToggleSecure={() => setHidden((value) => !value)}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
          />
          <AuthField
            label="New password"
            value={next}
            onChangeText={(value) => {
              setNext(value);
              setSheetError(null);
            }}
            secure={hidden}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
          />
          <AuthField
            label="Confirm new password"
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value);
              setSheetError(null);
            }}
            secure={hidden}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
          />
        </View>
        <Button
          label={saving ? 'Saving…' : 'Save new password'}
          block
          disabled={saving || !current || !next || !confirm}
          onPress={() => void save()}
        />
        <Button
          label="Forgot your current password? Email me a reset link"
          variant="ghost"
          block
          disabled={sendingReset}
          onPress={() => {
            setSheetOpen(false);
            void emailReset();
          }}
        />
      </Sheet>
    </>
  );
}
