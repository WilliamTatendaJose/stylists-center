import { useEffect, useState } from 'react';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 450;

export type AddressLookupStatus = 'idle' | 'searching' | 'ready' | 'not-found' | 'unavailable';

export interface AddressSuggestion {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface MapTilerFeature {
  id?: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
  geometry?: { type?: string; coordinates?: [number, number] };
}

interface MapTilerResponse {
  features?: MapTilerFeature[];
}

/** Debounced MapTiler address search, biased toward the user's current area. */
export function useAddressAutocomplete(
  query: string,
  proximity: { lat: number; lng: number },
): { suggestions: AddressSuggestion[]; status: AddressLookupStatus } {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [status, setStatus] = useState<AddressLookupStatus>('idle');

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    if (!MAPTILER_KEY) {
      setSuggestions([]);
      setStatus('unavailable');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setSuggestions([]);
      setStatus('searching');
      const params = new URLSearchParams({
        key: MAPTILER_KEY,
        autocomplete: 'true',
        country: 'zw',
        language: 'en',
        limit: '5',
        proximity: `${proximity.lng},${proximity.lat}`,
        types: 'address,road,poi,place,neighbourhood,locality',
      });

      void fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(term)}.json?${params.toString()}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(`Geocoder returned ${String(response.status)}`);
          return (await response.json()) as MapTilerResponse;
        })
        .then((result) => {
          const next = (result.features ?? []).flatMap((feature, index) => {
            const coordinate = feature.center ?? feature.geometry?.coordinates;
            const label = feature.place_name ?? feature.text;
            if (
              !coordinate ||
              coordinate.length < 2 ||
              !Number.isFinite(coordinate[0]) ||
              !Number.isFinite(coordinate[1]) ||
              !label
            ) {
              return [];
            }
            return [
              {
                id: feature.id ?? `${label}-${String(index)}`,
                label,
                lng: coordinate[0],
                lat: coordinate[1],
              },
            ];
          });
          setSuggestions(next);
          setStatus(next.length > 0 ? 'ready' : 'not-found');
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setSuggestions([]);
          setStatus('unavailable');
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [proximity.lat, proximity.lng, query]);

  return { suggestions, status };
}
