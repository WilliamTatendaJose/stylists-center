/** Where the address is kept between asking for the link and opening it, on the same browser. */
export const RESET_EMAIL_KEY = 'sc.admin.resetEmail';

/** The page the emailed link opens. */
export function resetLinkUrl(origin: string): string {
  return `${origin}/reset-password`;
}

function firebaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * Plain-language versions of the Firebase errors staff can actually hit. The
 * two setup ones name the console setting to fix, because the person who sees
 * them first is usually the one setting it up.
 */
export function resetErrorMessage(error: unknown): string {
  switch (firebaseCode(error)) {
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/missing-email':
      return 'Enter your email address.';
    case 'auth/operation-not-allowed':
      return 'Password reset isn’t switched on yet. In the Firebase console, turn on Email link sign-in under Authentication → Sign-in method → Email/Password.';
    case 'auth/unauthorized-continue-uri':
    case 'auth/unauthorized-domain':
      return 'This console’s address isn’t on Firebase’s authorised domains list yet (Firebase console → Authentication → Settings → Authorized domains).';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'Too many reset emails have been sent. Wait a while and try again.';
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'This link has expired or has already been used. Request a new one.';
    case 'auth/invalid-email-link-email':
      return 'That isn’t the address this link was sent to.';
    case 'auth/network-request-failed':
      return 'Couldn’t reach Firebase. Check your connection and try again.';
    default:
      return 'Something went wrong. Try again, or request a new link.';
  }
}
