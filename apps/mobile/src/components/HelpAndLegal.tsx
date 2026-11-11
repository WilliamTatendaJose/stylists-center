import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronRight, FileText, LifeBuoy, ShieldCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { space } from '@sc/tokens';
import { Card, Text, useTheme } from '@sc/ui';
import type { ContentKey } from '@sc/shared';
import { ProfileIconTile, ProfileSection } from './ProfileChrome.js';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l },
  copy: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  gap: { marginTop: space.m },
});

function LinkCard({
  icon,
  title,
  body,
  href,
  first = false,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  href: Href;
  first?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card
      bordered
      onPress={() => router.push(href)}
      style={[styles.row, first ? null : styles.gap]}
    >
      <ProfileIconTile>{icon}</ProfileIconTile>
      <View style={styles.copy}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="meta" color="neutral700" style={styles.meta}>
          {body}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.neutral700} />
    </Card>
  );
}

/**
 * Help and support plus the legal documents, on both profile screens. The
 * terms shown are the ones for whoever is looking: stylists see the stylist
 * terms, clients the client terms.
 */
export function HelpAndLegal({ terms }: { terms: ContentKey }) {
  const { colors } = useTheme();
  return (
    <ProfileSection label="Help and legal">
      <LinkCard
        first
        icon={<LifeBuoy size={20} color={colors.neutral700} />}
        title="Help and support"
        body="Contact StylistsCenter by phone, WhatsApp or email."
        href="/support"
      />
      <LinkCard
        icon={<FileText size={20} color={colors.neutral700} />}
        title="Terms and Conditions"
        body="The rules for using StylistsCenter."
        href={{ pathname: '/legal/[key]', params: { key: terms } }}
      />
      <LinkCard
        icon={<ShieldCheck size={20} color={colors.neutral700} />}
        title="Privacy policy"
        body="What information we keep and why."
        href={{ pathname: '/legal/[key]', params: { key: 'privacy' } }}
      />
    </ProfileSection>
  );
}
