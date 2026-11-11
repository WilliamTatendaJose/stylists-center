import { useState } from 'react';
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
 * screens, when everything is accepted, and when the status request fails (offline).
 */
export function TermsGate() {
  const { colors } = useTheme();
  const segments = useSegments();
  const signedIn = useAuthStore((s) => s.accessToken !== null);
  const { data } = useTermsStatus(signedIn);
  const accept = useAcceptTerms();
  const [failed, setFailed] = useState(false);

  const pending = pendingTermsDocuments(data);
  if (!signedIn || pending.length === 0 || isTermsGateExempt(segments[0])) return null;

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
      onRequestClose={() => undefined}
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
        </View>
      </Screen>
    </Modal>
  );
}
