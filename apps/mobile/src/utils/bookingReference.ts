/** Mocked client-side (handoff example: "SC-4471") — Phase 3's POST /v1/bookings issues the real one. */
export function generateBookingReference(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `SC-${String(n)}`;
}
