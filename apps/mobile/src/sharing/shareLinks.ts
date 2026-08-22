import { BASE_URL } from '../api/client.js';

/**
 * The API's own origin, resolved the same way every other request in the
 * app already resolves it (see src/api/client.ts). Both link builders below
 * key off this rather than a separate constant: it's what keeps them in
 * lockstep with app.config.ts's UNIVERSAL_LINK_HOST, which the two native
 * "does this app own this domain" verification files
 * (apple-app-site-association, assetlinks.json — see app-links.controller.ts)
 * are generated against. If they ever disagreed, a tapped link would open a
 * browser instead of the app instead of failing loudly, so there is exactly
 * one source of truth for the host on this side, not two.
 *
 * Tappable everywhere either way — that's the whole point over a bare
 * custom-scheme link — but a tap only opens the app directly once Universal
 * Links actually verify (APPLE_TEAM_ID and ANDROID_SHA256_CERT_FINGERPRINT
 * configured server-side, matching native config shipped in a real build).
 * Until then, or without the app installed, a tap lands on
 * app-links.controller.ts's matching fallback route instead — a store
 * redirect, not the shared content.
 */
function shareOrigin(): string {
  return new URL(BASE_URL).origin;
}

/** `https://<api host>/provider-share/<id>` — the Universal Link / App Link form of a shared provider profile. */
export function providerShareLink(id: string): string {
  return `${shareOrigin()}/provider-share/${id}`;
}

/** `https://<api host>/invite/<code>` — the Universal Link / App Link form of a shared referral invite. */
export function inviteShareLink(code: string): string {
  return `${shareOrigin()}/invite/${code}`;
}
