import { useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { useSessionStore } from '../state/index.js';

/**
 * Balanced (~100 m) rather than High: this position feeds "which stylists are
 * near me" and a distance shown to one decimal place. Street-level GPS costs
 * materially more battery and a longer time-to-first-fix for a number that
 * rounds to the same value either way.
 */
const ACCURACY = Location.Accuracy.Balanced;

/**
 * A stale fix is still a useful one for a radius search, but not indefinitely
 * — past this the cached position is ignored and we wait for a fresh read.
 */
const MAX_LAST_KNOWN_AGE_MS = 10 * 60 * 1000;

function formatAreaLabel(address: Location.LocationGeocodedAddress): string | null {
  // Suburb-level first: "Avondale, Harare" is what the design shows and what a
  // user recognises. `city`/`region` alone ("Harare") is a weak fallback, and
  // the whole label is dropped rather than shown as a bare country.
  const area = address.district ?? address.subregion ?? address.name;
  const city = address.city ?? address.region;
  if (area && city && area !== city) return `${area}, ${city}`;
  return area ?? city ?? null;
}

/**
 * Resolves the device's real position into the session store, which is what
 * every Find-tab query is keyed on. Before this existed the store held a
 * hardcoded Avondale constant, so the category counts, "available now" list
 * and every distance described a place the user might be nowhere near.
 *
 * Failure is always recorded as a `locationSource`, never swallowed: the
 * screen has to be able to say "we're showing the city centre because
 * location is off" instead of silently presenting a guess as a fix.
 */
export function useDeviceLocation() {
  const setLocation = useSessionStore((s) => s.setLocation);
  const setLocationSource = useSessionStore((s) => s.setLocationSource);
  const setAreaLabel = useSessionStore((s) => s.setAreaLabel);

  // Guards against a second run (React 18 StrictMode double-effect, or a
  // re-render mid-flight) racing two permission prompts at the user.
  const inFlight = useRef(false);

  const resolve = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setLocationSource('denied');
        return;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        setLocationSource('unavailable');
        return;
      }

      // Show something true immediately where possible: a recent cached fix
      // beats rendering the city centre while the GPS warms up.
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: MAX_LAST_KNOWN_AGE_MS,
      });
      if (lastKnown) {
        setLocation(
          { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude },
          'device',
        );
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: ACCURACY });
      const coords = { lat: current.coords.latitude, lng: current.coords.longitude };
      setLocation(coords, 'device');

      // Reverse geocoding is best-effort and separately fallible — it goes
      // through the OS geocoder, which is unavailable on some devices and
      // offline. A missing label must not invalidate a good fix.
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });
        setAreaLabel(address ? formatAreaLabel(address) : null);
      } catch {
        setAreaLabel(null);
      }
    } catch {
      setLocationSource('unavailable');
    } finally {
      inFlight.current = false;
    }
  }, [setAreaLabel, setLocation, setLocationSource]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  /** Re-ask. After a denial the OS will not re-prompt, so send them to Settings. */
  const retry = useCallback(async () => {
    const { canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (!canAskAgain) {
      await Linking.openSettings();
      return;
    }
    await resolve();
  }, [resolve]);

  return { retry };
}
