import { StyleSheet, View } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import { formatUsd, type MatchOfferDto } from '@sc/shared';
import { Text } from '../primitives/Text.js';
import { Button } from './Button.js';
import { Avatar } from './Avatar.js';

export interface OfferCardProps {
  offer: MatchOfferDto;
  onView: () => void;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderWidth: 1,
    borderColor: color.onDark.borderStrong,
    borderRadius: radius.card,
    padding: space.ml,
  },
  middle: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});

/**
 * An accepted-stylist card on the smart-match searching screen (dark). The
 * scOffer entrance animation belongs to the screen that lists these (each
 * card enters as it arrives), not the card itself — see @sc/ui/motion.
 */
export function OfferCard({ offer, onView }: OfferCardProps) {
  return (
    <View style={styles.card}>
      <Avatar initials={offer.initials} tint={offer.tint} size={46} />
      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text variant="cardTitle" color={color.onDark.text}>
            {offer.displayName}
          </Text>
          {offer.verified ? (
            <BadgeCheck size={11} strokeWidth={1.9} color={color.accent400} />
          ) : null}
        </View>
        <Text variant="metaSmall" color={color.onDark.body}>
          {offer.ratingAvg.toFixed(1)} ★ · {offer.completedCount} done · quotes{' '}
          {formatUsd(offer.quoteUsdCents)}
        </Text>
      </View>
      <Button label="View" onPress={onView} size="md" />
    </View>
  );
}
