import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { space } from '@sc/tokens';
import { EmptyPanel, Screen, ScreenHeader, Text, useTheme } from '@sc/ui';
import { CONTENT_TITLES, formatInHarare, isContentKey } from '@sc/shared';
import { useContentDocument } from '../../src/api/hooks/useAppConfig.js';
import { useBack } from '../../src/navigation/useBack.js';
import { paragraphs } from '../../src/content/format.js';

const styles = StyleSheet.create({
  draft: { borderRadius: 12, padding: space.m, marginBottom: space.l },
  paragraph: { marginBottom: space.m },
  meta: { marginTop: space.l },
});

/** A terms or privacy document, edited by StylistsCenter in the admin console. */
export default function LegalDocumentScreen() {
  const { colors } = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const onBack = useBack('/profile');
  const valid = isContentKey(key) ? key : 'terms-clients';
  const { data, isLoading, isError } = useContentDocument(valid);
  const title = data?.title ?? CONTENT_TITLES[valid];

  return (
    <Screen header={<ScreenHeader title={title} onBack={onBack} />}>
      {isLoading ? (
        <Text variant="body" color="neutral700">
          Loading…
        </Text>
      ) : isError || !data ? (
        <EmptyPanel title="Couldn't load this page" body="Check your connection and try again." />
      ) : (
        <View>
          {data.isPlaceholder ? (
            <View style={[styles.draft, { backgroundColor: colors.accent100 }]}>
              <Text variant="metaSmall" color={colors.accent700}>
                Draft: the final wording has not been published yet.
              </Text>
            </View>
          ) : null}
          {paragraphs(data.body).map((p, i) => (
            <Text key={i} variant="body" style={styles.paragraph}>
              {p}
            </Text>
          ))}
          {data.updatedAt ? (
            <Text variant="metaSmall" color="neutral600" style={styles.meta}>
              Version {data.version}, updated {formatInHarare(data.updatedAt, 'd MMM yyyy')}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
