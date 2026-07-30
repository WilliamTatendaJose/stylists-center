import { Screen, ScreenHeader, Text } from '@sc/ui';

/**
 * Phone entry (SRS auth, plan §6/§11 R4: phone + OTP, WhatsApp-first with SMS
 * fallback). Not yet wired into an auth gate — that lands with the API cutover
 * in Phase 3, once there is a session to gate on.
 */
export default function PhoneEntry() {
  return (
    <Screen header={<ScreenHeader title="Sign in" showBack={false} />}>
      <Text variant="body" color="neutral700">
        Enter your phone number to get started.
      </Text>
    </Screen>
  );
}
