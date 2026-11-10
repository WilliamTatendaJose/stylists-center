import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { radius, space } from '@sc/tokens';
import type { PaymentAction } from '@sc/shared';
import { Button, Text, TextField, useTheme } from '@sc/ui';
import { useSubmitPaymentOtp } from '../api/hooks/usePayments.js';
import { describeError } from '../api/errorMessage.js';

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'stretch',
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.l,
    gap: space.m,
    marginBottom: space.xl,
  },
  code: { textAlign: 'center', letterSpacing: 2 },
  center: { textAlign: 'center' },
});

/**
 * The two schemes in circulation for opening InnBucks with a code filled in.
 * Paynow's SDK and its developer hub disagree, so both are tried in turn and
 * the code stays on screen as text whichever one (if either) the installed
 * app registered.
 */
const INNBUCKS_DEEP_LINKS = [
  (code: string) => `schinn.wbpycode://innbucks.co.zw?pymInnCode=${encodeURIComponent(code)}`,
  (code: string) => `com.innbucks.customer://purchase?paymentToken=${encodeURIComponent(code)}`,
];

async function openInnBucks(code: string): Promise<boolean> {
  for (const build of INNBUCKS_DEEP_LINKS) {
    try {
      await Linking.openURL(build(code));
      return true;
    } catch {
      // Not registered on this phone; try the next scheme.
    }
  }
  return false;
}

export interface PaymentActionPanelProps {
  action: PaymentAction;
  /** The booking/order/subscription reference the payment was started under. */
  reference: string;
}

/**
 * The step a customer takes for InnBucks (enter a code in the InnBucks app)
 * or O'mari (type back the code O'mari texted). The verdict still comes from
 * the waiting screen's poll; this only gets the customer's part done.
 */
export function PaymentActionPanel({ action, reference }: PaymentActionPanelProps) {
  const { colors } = useTheme();
  const submitOtp = useSubmitPaymentOtp();
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (action.kind === 'innbucks') {
    return (
      <View style={[styles.panel, { borderColor: colors.divider }]}>
        <Text variant="meta" color="neutral700" style={styles.center}>
          Your InnBucks code
        </Text>
        <Text variant="h2" selectable style={styles.code}>
          {action.authorizationCode}
        </Text>
        {action.expiresLabel ? (
          <Text variant="metaSmall" color="neutral600" style={styles.center}>
            Valid until {action.expiresLabel}
          </Text>
        ) : null}
        <Button
          label="Open InnBucks"
          block
          onPress={() => {
            setMessage(null);
            void openInnBucks(action.authorizationCode).then((opened) => {
              if (!opened) {
                setMessage("Couldn't open InnBucks. Open it yourself and enter the code above.");
              }
            });
          }}
        />
        {message ? (
          <Text variant="metaSmall" color={colors.accent700} style={styles.center}>
            {message}
          </Text>
        ) : null}
      </View>
    );
  }

  const submit = () => {
    setMessage(null);
    submitOtp.mutate(
      { reference, otp: otp.trim() },
      {
        onSuccess: () => {
          setSent(true);
        },
        onError: (error) => {
          setMessage(
            describeError(error, "That code wasn't accepted. Check the SMS and try again."),
          );
        },
      },
    );
  };

  return (
    <View style={[styles.panel, { borderColor: colors.divider }]}>
      {sent ? (
        <Text variant="body" color="neutral700" style={styles.center}>
          Code sent. Waiting for O&apos;mari to confirm the payment.
        </Text>
      ) : (
        <>
          <TextField
            label={action.otpReference ? `O'mari code (ref ${action.otpReference})` : "O'mari code"}
            value={otp}
            onChangeText={(value) => {
              setOtp(value.replace(/\D/g, ''));
              setMessage(null);
            }}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={8}
          />
          <Button
            label={submitOtp.isPending ? 'Sending…' : 'Confirm payment'}
            block
            disabled={submitOtp.isPending || otp.trim().length < 4}
            onPress={submit}
          />
          <Text
            variant="metaSmall"
            color={message ? colors.accent700 : 'neutral600'}
            style={styles.center}
            {...(message ? { accessibilityLiveRegion: 'polite' as const } : {})}
          >
            {message ?? "O'mari cancels the payment after five wrong codes."}
          </Text>
        </>
      )}
    </View>
  );
}
