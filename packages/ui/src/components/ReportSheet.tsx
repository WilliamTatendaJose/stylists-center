import { StyleSheet, View } from 'react-native';
import { color, space } from '@sc/tokens';
import { REPORT_REASON_LABELS, type ReportReason } from '@sc/shared';
import { Text } from '../primitives/Text.js';
import { Pressable } from '../primitives/Pressable.js';
import { Button } from './Button.js';
import { Sheet } from './Sheet.js';

export interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason) => void;
}

const REASONS: ReportReason[] = ['no_show', 'misconduct', 'safety', 'other'];

const styles = StyleSheet.create({
  title: { marginBottom: space.s },
  body: { marginBottom: space.l },
  option: { paddingVertical: space.ml },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: color.divider },
  cancelButton: { marginTop: space.m },
});

/**
 * The report-a-problem sheet, shared across every context the handoff lists
 * (provider profile, product, job detail) — each call site supplies its own
 * onSubmit rather than this component knowing what's being reported on.
 * Tapping a reason submits immediately; CANCEL is the only other way out.
 */
export function ReportSheet({ open, onClose, onSubmit }: ReportSheetProps) {
  const submit = (reason: ReportReason) => {
    onSubmit(reason);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <Text variant="cardTitle" style={styles.title}>
        Report a problem
      </Text>
      <Text variant="body" color="neutral700" style={styles.body}>
        Tell us what happened. One report lowers a rating; a second brings a person in to review it
        within a day.
      </Text>
      <View>
        {REASONS.map((reason, index) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            accessibilityLabel={REPORT_REASON_LABELS[reason]}
            onPress={() => {
              submit(reason);
            }}
            style={[styles.option, index < REASONS.length - 1 ? styles.optionDivider : null]}
          >
            <Text variant="body">{REPORT_REASON_LABELS[reason]}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Cancel" variant="ghost" block onPress={onClose} style={styles.cancelButton} />
    </Sheet>
  );
}
