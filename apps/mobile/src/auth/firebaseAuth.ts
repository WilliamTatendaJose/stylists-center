import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import type { AuthTokens } from '@sc/shared';
import { apiFetch } from '../api/client.js';
import { useAuthStore } from '../state/useAuthStore.js';
import { firebaseAuth } from './firebaseClient.js';

export interface AuthResult {
  needsEmailVerification: boolean;
}

async function exchange(user: User): Promise<AuthResult> {
  if (!user.emailVerified) return { needsEmailVerification: true };
  const idToken = await user.getIdToken(true);
  const tokens = await apiFetch<AuthTokens>('/v1/auth/firebase/exchange', {
    method: 'POST',
    auth: false,
    body: { idToken },
  });
  await useAuthStore.getState().setSession(tokens);
  return { needsEmailVerification: false };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  return exchange(credential.user);
}

export async function createAccount(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
  await updateProfile(credential.user, { displayName: displayName.trim() });
  await sendEmailVerification(credential.user);
  return { needsEmailVerification: true };
}

export async function signInWithGoogle(): Promise<AuthResult | null> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    throw new Error('Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID from Firebase Console.');
  }

  GoogleSignin.configure({ webClientId, offlineAccess: false });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) return null;
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google did not return a valid sign-in credential.');
  }

  const firebaseCredential = GoogleAuthProvider.credential(response.data.idToken);
  const credential = await signInWithCredential(firebaseAuth, firebaseCredential);
  return exchange(credential.user);
}

export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
  } catch (error) {
    // Password recovery must not reveal whether an address has an account.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'auth/user-not-found'
    ) {
      return;
    }
    throw error;
  }
}

export async function resendVerification(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Sign in again to resend your verification email.');
  await sendEmailVerification(user);
}

export async function refreshVerificationAndContinue(): Promise<boolean> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Sign in again to continue.');
  await reload(user);
  if (!user.emailVerified) return false;
  await exchange(user);
  return true;
}

export function currentFirebaseEmail(): string | null {
  return firebaseAuth.currentUser?.email ?? null;
}

export function firebaseErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'That email or password is incorrect.',
    'auth/user-disabled': 'This account has been disabled. Contact support for help.',
    'auth/user-not-found': 'If that email has an account, a reset link will arrive shortly.',
    'auth/email-already-in-use': 'An account already exists for that email.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password with at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'Check your connection and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
  };
  if (messages[code]) return messages[code];
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
