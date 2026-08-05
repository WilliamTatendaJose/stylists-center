/**
 * Grid size, in degrees, that displayed provider coordinates are snapped to.
 *
 * ~0.0025° is about 280 m of latitude, and about 265 m of longitude at
 * Harare's latitude — roughly a city block. Small enough that a pin still
 * lands in the right neighbourhood and a route still points the right way,
 * large enough that it does not identify a house.
 */
const GRID_DEGREES = 0.0025;

/**
 * Coarsens a provider's position before it leaves the API.
 *
 * Most providers on this platform work from home, so their profile
 * coordinates are home addresses. The product already promises the exact
 * address is only shared shortly before an appointment ("exact plot number is
 * shared two hours before the appointment") — but the listing, map-pin and
 * route endpoints were returning the precise stored coordinate to any caller,
 * which meant the promise held in the UI copy and nowhere else. Requiring a
 * session narrows who can ask; it does not help, because anyone can register.
 *
 * Snapping rather than adding random jitter is deliberate: a random offset
 * differs on every request, so repeated calls average out to the true point.
 * A fixed grid returns the same coarse value every time and cannot be
 * de-noised by sampling.
 *
 * Distances and radius filtering are unaffected — those are computed in
 * PostGIS from the exact stored geography before this is applied.
 */
export function approximateLocation(latitude: number, longitude: number) {
  return {
    lat: Math.round(latitude / GRID_DEGREES) * GRID_DEGREES,
    lng: Math.round(longitude / GRID_DEGREES) * GRID_DEGREES,
  };
}
