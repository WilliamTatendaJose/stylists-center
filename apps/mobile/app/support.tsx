import { Linking, StyleSheet, View } from 'react-native';
import { Clock, Mail, MessageCircle, Phone } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { space } from '@sc/tokens';
import { Card, Pressable, Screen, ScreenHeader, Text, useTheme } from '@sc/ui';
import { ProfileIconTile } from '../src/components/ProfileChrome.js';
import { useAppConfig } from '../src/api/hooks/useAppConfig.js';
import { useBack } from '../src/navigation/useBack.js';
import { whatsappLink } from '../src/content/format.js';

const NOT_SET = 'To be confirmed';

const styles = StyleSheet.create({
  intro: { marginBottom: space.l },
  card: { paddingHorizontal: space.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  copy: { flex: 1, minWidth: 0 },
  value: { marginTop: 2 },
  note: { marginTop: space.l },
});

function ContactRow({
  icon,
  label,
  value,
  url,
  divided,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  url: string | null;
  divided?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View
      style={[styles.row, divided ? [styles.divided, { borderTopColor: colors.divider }] : null]}
    >
      <ProfileIconTile>{icon}</ProfileIconTile>
      <View style={styles.copy}>
        <Text variant="metaSmall" color="neutral600">
          {label}
        </Text>
        <Text
          variant="bodyStrong"
          color={value ? (url ? colors.accent700 : undefined) : 'neutral600'}
          style={styles.value}
        >
          {value || NOT_SET}
        </Text>
      </View>
    </View>
  );
  if (!value || !url) return content;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      onPress={() => void Linking.openURL(url)}
    >
      {content}
    </Pressable>
  );
}

/**
 * StylistsCenter's support contacts, as set on the console's Settings page.
 * Anything not yet provided shows "To be confirmed" rather than a guess.
 */
export default function SupportScreen() {
  const { colors } = useTheme();
  const onBack = useBack('/profile');
  const config = useAppConfig();
  const phone = config.supportPhone;
  const whatsapp = config.supportWhatsapp;
  const email = config.supportEmail;

  return (
    <Screen header={<ScreenHeader title="Help and support" onBack={onBack} />}>
      <Text variant="body" color="neutral700" style={styles.intro}>
        Questions about a booking, a payment or your account? Contact the StylistsCenter team.
      </Text>
      <Card bordered style={styles.card}>
        <ContactRow
          icon={<Phone size={20} color={colors.neutral700} />}
          label="Phone"
          value={phone}
          url={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null}
        />
        <ContactRow
          icon={<MessageCircle size={20} color={colors.neutral700} />}
          label="WhatsApp"
          value={whatsapp}
          url={whatsapp ? whatsappLink(whatsapp) : null}
          divided
        />
        <ContactRow
          icon={<Mail size={20} color={colors.neutral700} />}
          label="Email"
          value={email}
          url={email ? `mailto:${email}` : null}
          divided
        />
        <ContactRow
          icon={<Clock size={20} color={colors.neutral700} />}
          label="Support hours"
          value={config.supportHours}
          url={null}
          divided
        />
      </Card>
      <Text variant="metaSmall" color="neutral600" style={styles.note}>
        To report a stylist, client or review, use Report on their page or booking so the team sees
        the details.
      </Text>
    </Screen>
  );
}
