import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';
import { Avatar } from './Avatar.js';

export interface ListRowAvatarProps {
  initials: string;
  tint?: string;
  uri?: string;
  /** 40-54px per the handoff — the row's context picks the size (Home 54, Map sheet 40, Bookings 44). */
  size: number;
}

export interface ListRowProps {
  avatar: ListRowAvatarProps;
  title: string;
  /** e.g. the verified-badge tick beside a provider's name. */
  titleBadge?: ReactNode;
  meta?: string;
  subMeta?: string;
  rightPrimary?: string;
  rightCaption?: string;
  right?: ReactNode;
  divider?: boolean;
  onPress?: () => void;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.m,
    paddingVertical: space.ml,
    alignItems: 'flex-start',
  },
  divider: { borderBottomWidth: 1, borderBottomColor: color.divider },
  middle: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  right: { alignItems: 'flex-end' },
});

/**
 * The shared list row from the handoff's "Global chrome" section: round
 * avatar, a flexible name/meta/sub-meta middle column, an optional
 * price/caption right column, a 1px bottom divider, and a pressed background
 * — reused by Home's provider list, Bookings, the map sheet, and the
 * messages inbox.
 */
export function ListRow({
  avatar,
  title,
  titleBadge,
  meta,
  subMeta,
  rightPrimary,
  rightCaption,
  right,
  divider = true,
  onPress,
}: ListRowProps) {
  const content = (
    <>
      <Avatar initials={avatar.initials} tint={avatar.tint} uri={avatar.uri} size={avatar.size} />
      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <Text variant="cardTitle" numberOfLines={1}>
            {title}
          </Text>
          {titleBadge}
        </View>
        {meta ? (
          <Text variant="meta" color="neutral700">
            {meta}
          </Text>
        ) : null}
        {subMeta ? (
          <Text variant="metaSmall" color="neutral600">
            {subMeta}
          </Text>
        ) : null}
      </View>
      {rightPrimary || rightCaption || right ? (
        <View style={styles.right}>
          {rightPrimary ? <Text variant="cardTitle">{rightPrimary}</Text> : null}
          {rightCaption ? (
            <Text variant="statCaption" color="neutral600">
              {rightCaption}
            </Text>
          ) : null}
          {right}
        </View>
      ) : null}
    </>
  );

  const rowStyle = divider ? [styles.row, styles.divider] : styles.row;

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={rowStyle}
    >
      {content}
    </Pressable>
  );
}
