import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Env } from '../../config/env';

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  phoneNumber: string | null;
}

/** Verifies Firebase credentials at the API boundary; it never stores passwords. */
@Injectable()
export class FirebaseIdentityService {
  private readonly app: App | null;

  constructor(private readonly config: ConfigService<Env, true>) {
    const projectId = this.config.get('FIREBASE_PROJECT_ID', { infer: true });
    const clientEmail = this.config.get('FIREBASE_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FIREBASE_PRIVATE_KEY', { infer: true });

    if (!projectId) {
      this.app = null;
      return;
    }

    this.app =
      getApps().find((candidate) => candidate.name === 'stylists-center-auth') ??
      initializeApp(
        {
          projectId,
          ...(clientEmail && privateKey
            ? {
                credential: cert({
                  projectId,
                  clientEmail,
                  privateKey: privateKey.replace(/\\n/g, '\n'),
                }),
              }
            : {}),
        },
        'stylists-center-auth',
      );
  }

  async verifyIdToken(idToken: string): Promise<FirebaseIdentity> {
    if (!this.app) {
      throw new ServiceUnavailableException('Firebase authentication is not configured');
    }

    try {
      const decoded = await getAuth(this.app).verifyIdToken(idToken, true);
      return {
        uid: decoded.uid,
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? false,
        displayName: typeof decoded.name === 'string' ? decoded.name : null,
        photoUrl: typeof decoded.picture === 'string' ? decoded.picture : null,
        phoneNumber: decoded.phone_number ?? null,
      };
    } catch {
      throw new UnauthorizedException('Firebase session is invalid or expired');
    }
  }
}
