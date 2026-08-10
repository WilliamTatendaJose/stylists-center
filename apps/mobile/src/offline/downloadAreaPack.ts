import { OfflineManager, type OfflinePackCreateOptions } from '@maplibre/maplibre-react-native';

/**
 * Bounding box (west, south, east, north) around the seeded Avondale/Harare
 * provider area, generous enough to cover every M1 fixture location
 * (Borrowdale is the farthest out, ~8.5 km from the client point).
 */
const AVONDALE_AREA_BOUNDS: [number, number, number, number] = [30.98, -17.84, 31.1, -17.72];

const AVONDALE_PACK_NAME = 'avondale-area';
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;

/**
 * Downloads the offline tile pack for the client's home area, once, on first
 * login (plan §5/§9 item 18). `OfflineManager.createPack` needs a *style URL*
 * string, not the inline `StyleSpecification` object `@sc/ui`'s `ScMap` uses
 * for its live raster basemap — so this can't reuse that style directly.
 *
 * MapTiler is the selected production tile vendor. Local development may
 * render the live OSM fallback, but deliberately skips this offline pack:
 * the public OSM tile server does not permit bulk downloads.
 */
export async function downloadAvondaleAreaPack(): Promise<boolean> {
  // Never bulk-download from the live OSM development fallback. MapTiler is
  // required by app.config.ts for preview and production builds.
  if (!MAPTILER_KEY) return false;

  const options: OfflinePackCreateOptions = {
    mapStyle: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
    bounds: AVONDALE_AREA_BOUNDS,
    minZoom: 12,
    maxZoom: 16,
    metadata: { name: AVONDALE_PACK_NAME },
  };

  await OfflineManager.createPack(
    options,
    () => {
      /* progress — no UI hooked up in M1; the pack downloads silently in the background */
    },
    () => {
      /* left for a retry on next launch (see useOfflinePack) rather than surfacing an error UI in M1 */
    },
  );
  return true;
}
