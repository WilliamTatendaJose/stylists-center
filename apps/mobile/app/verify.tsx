import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@sc/tokens';
import { Screen, ScreenHeader, Text, Button, useTheme } from '@sc/ui';
import { useBack } from '../src/navigation/useBack.js';
import { useSubmitVerification, useVerification } from '../src/api/hooks/useVerification.js';
import { describeError } from '../src/api/errorMessage.js';
import { PhotoPicker } from '../src/components/PhotoPicker.js';

const styles = StyleSheet.create({
  intro: { marginBottom: space.xl },
  field: { marginBottom: space.xl },
  status: { marginBottom: space.l },
  footer: { gap: space.s },
});

export default function VerifyIdentity() {
  const colors = useTheme().colors;
  const onBack = useBack('/profile');
  const { data: verification } = useVerification();
  const submitVerification = useSubmitVerification();
  const [idDocumentUrl, setIdDocumentUrl] = useState<string[]>([]);
  const [selfieImageUrl, setSelfieImageUrl] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!verification) return;
    setIdDocumentUrl(verification.idDocumentUrl ? [verification.idDocumentUrl] : []);
    setSelfieImageUrl(verification.selfieImageUrl ? [verification.selfieImageUrl] : []);
  }, [verification]);

  const canSubmit =
    idDocumentUrl.length === 1 && selfieImageUrl.length === 1 && !submitVerification.isPending;
  const status = verification?.status ?? 'unverified';
  const isVerified = status === 'verified';

  const submit = () => {
    const idDocument = idDocumentUrl[0];
    const selfie = selfieImageUrl[0];
    if (!idDocument || !selfie || isVerified) return;
    setError(null);
    submitVerification.mutate(
      { idDocumentUrl: idDocument, selfieImageUrl: selfie },
      { onError: (reason) => setError(describeError(reason, "Couldn't submit verification. Try again.")) },
    );
  };

  return (
    <Screen
      header={<ScreenHeader title="Verify your identity" onBack={onBack} />}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text variant="meta" color={colors.accent700} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            label={
              isVerified
                ? 'Identity verified'
                : submitVerification.isPending
                  ? 'Submitting…'
                  : status === 'pending'
                    ? 'Send updated documents'
                    : 'Submit for review'
            }
            block
            disabled={!canSubmit || isVerified}
            onPress={submit}
          />
        </View>
      }
    >
      <Text variant="body" color="neutral700" style={styles.intro}>
        A clear ID photo and a matching selfie help clients trust the person behind a stylist page
        or agent reward account. We review these documents manually and keep them private.
      </Text>

      {status !== 'unverified' ? (
        <Text variant="meta" color={status === 'verified' ? 'accent700' : 'neutral700'} style={styles.status}>
          {status === 'verified'
            ? 'Your identity is verified. No further action is needed.'
            : 'Your documents are with the review team. You can replace them while they are pending.'}
        </Text>
      ) : null}

      <View style={styles.field}>
        <PhotoPicker
          label="Government ID"
          urls={idDocumentUrl}
          maxPhotos={1}
          uploadEndpoint="/v1/me/images"
          helpText="Use a readable national ID, passport, or driver licence."
          disabled={isVerified || submitVerification.isPending}
          onChange={setIdDocumentUrl}
          onError={setError}
        />
      </View>
      <View style={styles.field}>
        <PhotoPicker
          label="Live selfie"
          urls={selfieImageUrl}
          maxPhotos={1}
          uploadEndpoint="/v1/me/images"
          helpText="Take a clear face photo in good light; do not use someone else’s photo."
          disabled={isVerified || submitVerification.isPending}
          onChange={setSelfieImageUrl}
          onError={setError}
        />
      </View>

      {verification?.note ? (
        <Text variant="meta" color="accent700">
          Review note: {verification.note}
        </Text>
      ) : null}
    </Screen>
  );
}
