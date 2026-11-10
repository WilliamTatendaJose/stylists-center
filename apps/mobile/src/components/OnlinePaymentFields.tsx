import { StyleSheet, View } from 'react-native';
import { space } from '@sc/tokens';
import {
  isValidMobileMoneyPhone,
  PAY_CHANNEL_LABELS,
  PHONE_PAY_CHANNELS,
  type PayChannel,
} from '@sc/shared';
import { Chip, Text, TextField, useTheme } from '@sc/ui';

const styles = StyleSheet.create({
  label: { marginBottom: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  field: { marginTop: space.l },
  help: { marginTop: space.s },
});

const PHONE_HELP: Record<PayChannel, string> = {
  ecocash: "We'll send the EcoCash prompt here. It doesn't have to be your login number.",
  onemoney: "We'll send the OneMoney prompt here. It doesn't have to be your login number.",
  innbucks: "The InnBucks account to pay from. You'll get a code to approve in the InnBucks app.",
  omari: "O'mari will text a one-time code to this number. You'll enter it on the next screen.",
  card: '',
};

/** Returns an error message for a bad number, or null when the channel needs none or it is valid. */
export function payerPhoneError(channel: PayChannel, phone: string): string | null {
  if (!PHONE_PAY_CHANNELS.has(channel)) return null;
  return isValidMobileMoneyPhone(phone.trim())
    ? null
    : 'Enter a valid mobile number, for example 077 000 0000.';
}

export interface OnlinePaymentFieldsProps {
  channels: readonly PayChannel[];
  channel: PayChannel;
  onChannelChange: (channel: PayChannel) => void;
  phone: string;
  onPhoneChange: (phone: string) => void;
  phoneError: string | null;
}

/**
 * The wallet/card picker and the number to bill, shared by every screen that
 * takes an online payment so the three cannot drift apart.
 */
export function OnlinePaymentFields({
  channels,
  channel,
  onChannelChange,
  phone,
  onPhoneChange,
  phoneError,
}: OnlinePaymentFieldsProps) {
  const { colors } = useTheme();
  const needsPhone = PHONE_PAY_CHANNELS.has(channel);

  return (
    <View style={styles.field}>
      {channels.length > 1 ? (
        <>
          <Text variant="meta" color="neutral700" style={styles.label}>
            Pay with
          </Text>
          <View style={styles.chips}>
            {channels.map((option) => (
              <Chip
                key={option}
                label={PAY_CHANNEL_LABELS[option]}
                selected={option === channel}
                onPress={() => {
                  onChannelChange(option);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      {needsPhone ? (
        <View style={styles.field}>
          <TextField
            label={`${PAY_CHANNEL_LABELS[channel]} number`}
            value={phone}
            onChangeText={onPhoneChange}
            placeholder="077 000 0000"
            keyboardType="phone-pad"
          />
          <Text
            variant="metaSmall"
            color={phoneError ? colors.accent700 : 'neutral600'}
            style={styles.help}
            {...(phoneError ? { accessibilityLiveRegion: 'polite' as const } : {})}
          >
            {phoneError ?? PHONE_HELP[channel]}
          </Text>
        </View>
      ) : (
        <Text variant="metaSmall" color="neutral600" style={styles.help}>
          You&apos;ll enter your card on Paynow&apos;s secure page. Card details never pass through
          Style Center.
        </Text>
      )}
    </View>
  );
}
