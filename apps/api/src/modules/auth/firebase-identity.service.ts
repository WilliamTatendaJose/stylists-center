import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type UpdateRequest } from 'firebase-admin/auth';
import type { Env } from '../../config/env';

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  phoneNumber: string | null;
}

export type FirebaseAccountStatus = 'active' | 'disabled' | 'missing';

/** Verifies Firebase credentials at the API boundary; it never stores passwords. */
@Injectable()
export class FirebaseIdentityService {
  private readonly app: App | null;
  private readonly managementAuth: Auth | null;
  private readonly checkRevoked: boolean;

  constructor(private readonly config: ConfigService<Env, true>) {
    const projectId = this.config.get('FIREBASE_PROJECT_ID', { infer: true });
    const clientEmail = this.config.get('FIREBASE_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FIREBASE_PRIVATE_KEY', { infer: true });

    if (!projectId) {
      this.app = null;
      this.managementAuth = null;
      this.checkRevoked = false;
      return;
    }

    // Signature, issuer, audience and expiry verification only needs the
    // Firebase project ID; the Admin SDK downloads and caches Google's public
    // signing certificates. A service account is optional and only needed for
    // the additional per-login revocation/disabled-user lookup.
    this.checkRevoked = Boolean(clientEmail && privateKey);

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
    this.managementAuth = this.checkRevoked ? getAuth(this.app) : null;
  }

  async verifyIdToken(idToken: string): Promise<FirebaseIdentity> {
    if (!this.app) {
      throw new ServiceUnavailableException('Firebase authentication is not configured');
    }

    try {
      const decoded = await getAuth(this.app).verifyIdToken(idToken, this.checkRevoked);
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

  /** Firebase Admin writes require service-account credentials, not only a project ID. */
  private requireManagementAuth(): Auth {
    if (!this.managementAuth) {
      throw new ServiceUnavailableException(
        'Firebase user management requires FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY',
      );
    }
    return this.managementAuth;
  }

  async getAccountStatus(uid: string): Promise<FirebaseAccountStatus> {
    try {
      const user = await this.requireManagementAuth().getUser(uid);
      return user.disabled ? 'disabled' : 'active';
    } catch (error) {
      if (firebaseErrorCode(error) === 'auth/user-not-found') return 'missing';
      throw error;
    }
  }

  async getAccountStatuses(uids: string[]): Promise<Map<string, FirebaseAccountStatus>> {
    const uniqueUids = [...new Set(uids)].slice(0, 100);
    if (uniqueUids.length === 0) return new Map();
    const result = await this.requireManagementAuth().getUsers(uniqueUids.map((uid) => ({ uid })));
    const statuses = new Map<string, FirebaseAccountStatus>();
    for (const user of result.users) statuses.set(user.uid, user.disabled ? 'disabled' : 'active');
    for (const missing of result.notFound) {
      if ('uid' in missing && missing.uid) statuses.set(missing.uid, 'missing');
    }
    return statuses;
  }

  async createAccount(input: {
    email: string;
    displayName: string;
    password: string;
  }): Promise<{ uid: string }> {
    try {
      const user = await this.requireManagementAuth().createUser({
        email: input.email,
        emailVerified: true,
        displayName: input.displayName,
        password: input.password,
      });
      return { uid: user.uid };
    } catch (error) {
      if (firebaseErrorCode(error) === 'auth/email-already-exists') {
        throw new ConflictException('A Firebase account with this email already exists');
      }
      throw error;
    }
  }

  async updateAccount(uid: string, input: UpdateRequest): Promise<void> {
    try {
      await this.requireManagementAuth().updateUser(uid, input);
    } catch (error) {
      const code = firebaseErrorCode(error);
      if (code === 'auth/user-not-found') {
        throw new ConflictException('The linked Firebase account no longer exists');
      }
      if (code === 'auth/email-already-exists') {
        throw new ConflictException('A Firebase account with this email already exists');
      }
      throw error;
    }
  }

  async disableAccount(uid: string): Promise<void> {
    try {
      await this.requireManagementAuth().updateUser(uid, { disabled: true });
    } catch (error) {
      if (firebaseErrorCode(error) !== 'auth/user-not-found') throw error;
    }
  }

  async deleteAccount(uid: string): Promise<void> {
    try {
      await this.requireManagementAuth().deleteUser(uid);
    } catch (error) {
      if (firebaseErrorCode(error) !== 'auth/user-not-found') throw error;
    }
  }
}

function firebaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
