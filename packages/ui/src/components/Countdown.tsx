import { useEffect, useRef, useState } from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';
import { color } from '@sc/tokens';
import { Text } from '../primitives/Text.js';
import { secondsRemaining, formatMmSs } from './countdownTime.js';

export interface CountdownProps {
  /** ISO-8601. In production this is server-issued and this component only ever displays it — see plan §6, "the client clock only animates." */
  expiresAt: string;
  caption: string;
  onExpire?: () => void;
  onDark?: boolean;
}

/**
 * The big numeral on the smart-match searching screen and the provider's
 * incoming-request screen. Ticks at 250ms (so a briefly-busy JS thread never
 * visibly skips a second) but renders at second granularity, and resyncs
 * immediately when the app returns to the foreground rather than trusting a
 * stale interval that kept "running" while backgrounded.
 */
export function Countdown({ expiresAt, caption, onExpire, onDark = false }: CountdownProps) {
  const [remaining, setRemaining] = useState(() => secondsRemaining(expiresAt));
  const expiredRef = useRef(false);
  const lastAnnouncedRef = useRef(-1);

  useEffect(() => {
    expiredRef.current = false;
    lastAnnouncedRef.current = -1;
    setRemaining(secondsRemaining(expiresAt));

    const tick = () => {
      setRemaining(secondsRemaining(expiresAt));
    };
    const interval = setInterval(tick, 250);

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') tick();
    };
    const sub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [expiresAt]);

  useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  // Announce only on 30s boundaries (and at zero) so a screen reader isn't
  // narrating every single second.
  const shouldAnnounce =
    remaining === 0 || (remaining % 30 === 0 && remaining !== lastAnnouncedRef.current);
  if (shouldAnnounce) lastAnnouncedRef.current = remaining;

  const ink = onDark ? color.onDark.text : color.text;
  const captionColor = onDark ? color.onDark.meta : color.neutral600;

  return (
    <View
      accessibilityLiveRegion={shouldAnnounce ? 'polite' : 'none'}
      accessibilityLabel={`${formatMmSs(remaining)} remaining, ${caption}`}
    >
      <Text variant="countdown" color={ink} align="center">
        {formatMmSs(remaining)}
      </Text>
      <Text variant="kicker" color={captionColor} align="center">
        {caption}
      </Text>
    </View>
  );
}
