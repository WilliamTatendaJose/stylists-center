import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { deriveInitials, deriveTint } from '@sc/shared';
import { color, space } from '@sc/tokens';
import { Avatar, Badge, Card, Text, useTheme } from '@sc/ui';

const styles = StyleSheet.create({
  hero: {
    padding: space.xl,
    marginBottom: space.xxl,
    backgroundColor: color.neutral900,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.l },
  heroCopy: { flex: 1, minWidth: 0 },
  heroSubtitle: { marginTop: 3 },
  heroNote: { marginTop: space.l },
  section: { marginBottom: space.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: space.m,
  },
  sectionTitle: { flex: 1 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: space.l,
  },
  detailDivider: { borderTopWidth: 1, borderTopColor: color.divider },
  detailCopy: { flex: 1, minWidth: 0 },
  detailValue: { marginTop: 2 },
});

export function ProfileHero({
  name,
  subtitle,
  note,
  roleLabel,
  imageUrl,
}: {
  name: string;
  subtitle: string;
  note: string;
  roleLabel: string;
  imageUrl?: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={[styles.hero, { backgroundColor: colors.neutral900 }]}>
      <View style={styles.heroTop}>
        <Avatar initials={deriveInitials(name)} tint={deriveTint(name)} uri={imageUrl} size={72} />
        <View style={styles.heroCopy}>
          <Text variant="cardTitle" color={color.onDark.text} numberOfLines={1}>
            {name}
          </Text>
          <Text
            variant="meta"
            color={color.onDark.body}
            style={styles.heroSubtitle}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
        <Badge label={roleLabel} tone="neutral" />
      </View>
      <Text variant="meta" color={color.onDark.body} style={styles.heroNote}>
        {note}
      </Text>
    </Card>
  );
}

export function ProfileSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="sectionLabel" style={styles.sectionTitle}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text variant="meta" color="neutral600">
            {count}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ProfileIconTile({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.iconTile, { backgroundColor: colors.surface }]}>{children}</View>;
}

export function ProfileInfoRow({
  icon,
  label,
  value,
  divided = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  divided?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.detailRow,
        divided ? styles.detailDivider : null,
        divided ? { borderTopColor: colors.divider } : null,
      ]}
    >
      <ProfileIconTile>{icon}</ProfileIconTile>
      <View style={styles.detailCopy}>
        <Text variant="metaSmall" color="neutral600">
          {label}
        </Text>
        <Text variant="bodyStrong" style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}
