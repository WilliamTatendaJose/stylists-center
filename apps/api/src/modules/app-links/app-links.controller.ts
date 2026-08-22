import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env';

/**
 * Same identity for both stores — set once in app.config.ts's
 * `ios.bundleIdentifier` / `android.package` and never expected to diverge.
 */
const BUNDLE_ID = 'zw.co.stylistscenter.app';

/** The one path both stores' verification files grant this app control over. */
const LINKED_PATH = '/provider-share/*';

/**
 * Universal Links (iOS) / App Links (Android) for shared provider-profile
 * links (mobile's provider-share/[id].tsx). Unprefixed and unauthenticated
 * on purpose:
 *  - the two .well-known files MUST live at the domain root per the Apple/
 *    Google spec, so main.ts excludes them from the global /v1 prefix;
 *  - both are fetched by the OS itself, never a signed-in client, to decide
 *    whether this app owns a path before a single link is ever tapped.
 *
 * /provider-share/:id is the same path the app's own screen uses — reusing
 * it means a verified device never reaches this controller at all (the OS
 * hands the tap straight to the app); this only runs for a browser that
 * doesn't have the app, or hasn't verified the domain yet.
 *
 * APPLE_TEAM_ID / ANDROID_SHA256_CERT_FINGERPRINT are unset until supplied —
 * both well-known files still return a valid, spec-compliant "no app
 * registered" response in that case, so deploying this before either is
 * configured is safe.
 */
@SkipThrottle()
@Controller()
export class AppLinksController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    const teamId = this.config.get('APPLE_TEAM_ID', { infer: true });
    return {
      applinks: {
        apps: [],
        details: teamId ? [{ appID: `${teamId}.${BUNDLE_ID}`, paths: [LINKED_PATH] }] : [],
      },
    };
  }

  @Get('.well-known/assetlinks.json')
  @Header('Content-Type', 'application/json')
  assetLinks() {
    const fingerprint = this.config.get('ANDROID_SHA256_CERT_FINGERPRINT', { infer: true });
    return fingerprint
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: BUNDLE_ID,
              sha256_cert_fingerprints: [fingerprint],
            },
          },
        ]
      : [];
  }

  /**
   * Reached only when the tap didn't get intercepted by the app — no app
   * installed, or the OS hasn't verified this domain yet. Sends the person
   * to the right store instead of a bare 404; the custom-scheme deep link in
   * the share message still carries the provider id for once they're back
   * with the app installed.
   */
  @Get('provider-share/:id')
  redirectToStore(@Req() req: Request, @Res() res: Response) {
    const userAgent = req.headers['user-agent'] ?? '';
    const isIOS = /iphone|ipad|ipod/i.test(userAgent);
    const iosUrl = this.config.get('IOS_APP_STORE_URL', { infer: true });
    const androidUrl = this.config.get('ANDROID_PLAY_STORE_URL', { infer: true });

    if (isIOS && iosUrl) {
      res.redirect(302, iosUrl);
      return;
    }
    if (!isIOS) {
      res.redirect(302, androidUrl);
      return;
    }
    // iOS with no store listing yet — nothing sane to redirect to.
    res.status(200).send('Style Center — get the app to view this stylist’s page.');
  }
}
