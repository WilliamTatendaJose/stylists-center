/**
 * Pure clock math for Countdown, split out so it's unit-testable without a
 * React Native renderer.
 */
export function secondsRemaining(expiresAtIso: string, now: number = Date.now()): number {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  return Math.max(0, Math.round((expiresAtMs - now) / 1000));
}

export function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}
