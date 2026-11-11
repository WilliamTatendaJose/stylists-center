import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { radius, space } from '@sc/tokens';
import { Button, Pressable, Screen, Text, useTheme } from '@sc/ui';
import { useAuthStore } from '../state/useAuthStore.js';
import { useAcceptTerms, useTermsStatus } from '../api/hooks/useTerms.js';
import { isTermsGateExempt, pendingTermsDocuments } from './termsGate.js';

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl, gap: space.m },
  intro: { marginBottom: space.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.tile,
    paddingVertical: space.l,
    paddingHorizontal: space.l,
  },
  rowText: { flex: 1, marginRight: space.s },
  footer: { paddingVertical: space.l, gap: space.s },
});

/**
 * Full-screen sheet that asks a signed-in user to agree to any terms or privacy
 * document whose current version they have not accepted yet. Mounted once in
 * the root layout. It renders nothing when signed out, on the sign-in and legal
 * screens, when everything is accepted, when the status request fails (offline),
 * and after the user taps "Later" (until the app is next opened).
 */
export function TermsGate() {
  const { colors } = useTheme();
  const segments = useSegments();
  const signedIn = useAuthStore((s) => s.accessToken !== null);
  const { data } = useTermsStatus(signedIn);
  const accept = useAcceptTerms();
  const [failed, setFailed] = useState(false);
  // "Later" hides the sheet until the app is next opened. Kept in component
  // state on purpose: the gate is mounted once at the root, so this lasts
  // exactly one app session, and the user is asked again on the next launch.
  const [postponed, setPostponed] = useState(false);
  // A different account signing in on this phone is asked afresh.
  useEffect(() => {
    if (!signedIn) setPostponed(false);
  }, [signedIn]);

  const pending = pendingTermsDocuments(data);
  if (!signedIn || postponed || pending.length === 0 || isTermsGateExempt(segments[0])) {
    return null;
  }

  async function agreeToAll() {
    setFailed(false);
    try {
      await Promise.all(
        pending.map((doc) => accept.mutateAsync({ key: doc.key, version: doc.version })),
      );
    } catch {
      setFailed(true);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        setPostponed(true);
      }}
    >
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="h2Small" style={styles.intro}>
            Please read and agree
          </Text>
          <Text variant="bodyLarge" color="neutral700" style={styles.intro}>
            Agree to these documents to keep using StylistsCenter. Tap a document to read it first.
          </Text>
          {pending.map((doc) => (
            <Pressable
              key={doc.key}
              accessibilityRole="link"
              accessibilityLabel={`Read ${doc.title}`}
              onPress={() => router.push({ pathname: '/legal/[key]', params: { key: doc.key } })}
              style={[styles.row, { borderColor: colors.divider, backgroundColor: colors.surface }]}
            >
              <View style={styles.rowText}>
                <Text variant="bodyStrong">{doc.title}</Text>
              </View>
              <ChevronRight size={20} color={colors.neutral700} />
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          {failed ? (
            <Text variant="metaSmall" color={colors.accent700}>
              We could not save your agreement. Check your connection and try again.
            </Text>
          ) : null}
          <Button
            label="I agree"
            block
            loading={accept.isPending}
            onPress={() => void agreeToAll()}
          />
          <Button
            label="Later"
            variant="ghost"
            block
            disabled={accept.isPending}
            onPress={() => {
              setPostponed(true);
            }}
          />
          <Text variant="metaSmall" color="neutral600">
            We'll ask again next time you open the app.
          </Text>
        </View>
      </Screen>
    </Modal>
  );
}
