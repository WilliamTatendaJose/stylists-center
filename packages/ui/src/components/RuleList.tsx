import { StyleSheet, View } from 'react-native';
import { color, space } from '@sc/tokens';
import { Text } from '../primitives/Text.js';

export interface RuleListItem {
  label: string;
  value: string;
}

export interface RuleListProps {
  items: RuleListItem[];
  /**
   * Renders on the full-accent screens (Booked/Ordered) — white ink on
   * translucent-white hairlines instead of body ink on divider.
   *
   * IMPORTANT accessibility note (plan risk R5, enforced in
   * @sc/tokens' tokens.test.ts "documents exactly which variants stay AA"):
   * white-on-accent tops out at ~4.20:1, which clears WCAG's large-text
   * threshold but NOT the 4.5:1 body-text threshold this component's rows
   * render at (13px). This is a known, real accessibility gap inherited from
   * the design handoff on the two screens that use onAccent — flagged to
   * design, not silently shipped or worked around by unilaterally changing
   * the brand accent colour.
   */
  onAccent?: boolean;
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.xs + 1,
    borderBottomWidth: 1,
  },
});

/** The label/value hairline list on Booked, the payment summary, and the wallet commission table. */
export function RuleList({ items, onAccent = false }: RuleListProps) {
  const ruleColor = onAccent ? color.onAccent.rule : color.divider;
  const labelColor = onAccent ? color.onAccent.labelDim : color.neutral700;
  const valueColor = onAccent ? color.onAccent.text : color.text;
  const listStyle = { borderTopColor: ruleColor };

  return (
    <View style={[styles.list, listStyle]}>
      {items.map((item, index) => {
        const rowStyle = { borderBottomColor: ruleColor };
        return (
          <View key={`${item.label}-${String(index)}`} style={[styles.row, rowStyle]}>
            <Text variant="body" color={labelColor}>
              {item.label}
            </Text>
            <Text variant="bodyStrong" color={valueColor}>
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
