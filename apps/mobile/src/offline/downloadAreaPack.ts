import { OfflineManager, type OfflinePackCreateOptions } from '@maplibre/maplibre-react-native';

/**
 * Bounding box (west, south, east, north) around the seeded Avondale/Harare
 * provider area, generous enough to cover every M1 fixture location
 * (Borrowdale is the farthest out, ~8.5 km from the client point).
 */
const AVONDALE_AREA_BOUNDS: [number, number, number, number] = [30.98, -17.84, 31.1, -17.72];

const AVONDALE_PACK_NAME = 'avondale-area';

/**
 * Downloads the offline tile pack for the client's home area, once, on first
 * login (plan §5/§9 item 18). `OfflineManager.createPack` needs a *style URL*
 * string, not the inline `StyleSpecification` object `@sc/ui`'s `ScMap` uses
 * for its live raster basemap — so this can't reuse that style directly.
 *
 * The URL below is a placeholder. Plan risk R1 is still open: a real tile
 * vendor (MapTiler, self-hosted Protomaps) must be chosen before launch,
 * since `tile.openstreetmap.org`'s usage policy explicitly forbids bulk/
 * offline downloading — this function's whole purpose. Swap the URL for that
 * vendor's hosted style once decided; nothing else here changes.
 */
export async function downloadAvondaleAreaPack(): Promise<void> {
  const options: OfflinePackCreateOptions = {
    mapStyle: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
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
}
