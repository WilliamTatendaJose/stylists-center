import { BASE_URL } from '../api/client.js';

/**
 * `https://<api host>/provider-share/<id>` — the Universal Link / App Link
 * form of a shared provider profile.
 *
 * Deliberately built from BASE_URL (the same resolved API origin every other
 * request in the app already uses) rather than a separate constant: it's
 * what keeps this in lockstep with app.config.ts's UNIVERSAL_LINK_HOST,
 * which the two native "does this app own this domain" verification files
 * (apple-app-site-association, assetlinks.json — see app-links.controller.ts)
 * are generated against. If they ever disagreed, a tapped link would open a
 * browser instead of the app instead of failing loudly, so there is exactly
 * one source of truth for the host on this side, not two.
 *
 * Tappable everywhere either way — that's the whole point over the bare
 * custom-scheme link this replaces — but only opens the app directly once
 * Universal Links actually verify (APPLE_TEAM_ID and
 * ANDROID_SHA256_CERT_FINGERPRINT configured server-side, matching native
 * config shipped in a real build). Until then, or without the app installed,
 * a tap lands on app-links.controller.ts's `/provider-share/:id` fallback
 * instead — a store redirect, not the profile.
 */
export function providerShareLink(id: string): string {
  return `${new URL(BASE_URL).origin}/provider-share/${id}`;
}
