import { useEffect, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { usePasswordReset } from '../api/auth';
import { ApiError } from '../api/client';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { getFirebaseAuth } from '../firebase';
import { RESET_EMAIL_KEY, resetErrorMessage } from '../passwordReset';

type LinkState = 'checking' | 'valid' | 'invalid';

/**
 * Step 2 of "forgot password", opened from the emailed link. Completing the
 * Firebase email-link sign-in yields an ID token proving the address; the API
 * checks it belongs to an active staff account and sets the new password
 * (asking for a 2FA code when the account has 2FA on).
 *
 * The link's code is single-use, so the Firebase user is kept after the first
 * attempt: a wrong 2FA code or a too-short password can be corrected without
 * needing a new email.
 */
export function ResetPasswordPage() {
  const reset = usePasswordReset();
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [link] = useState(() => window.location.href);
  const [email, setEmail] = useState(() => window.localStorage.getItem(RESET_EMAIL_KEY) ?? '');
  const [askEmail] = useState(() => !window.localStorage.getItem(RESET_EMAIL_KEY));
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const [auth, { isSignInWithEmailLink }] = await Promise.all([
        getFirebaseAuth(),
        import('firebase/auth'),
      ]);
      setLinkState(isSignInWithEmailLink(auth, link) ? 'valid' : 'invalid');
      // Keep the one-time code out of the address bar and browser history.
      window.history.replaceState(null, '', window.location.pathname);
    })();
  }, [link]);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (password !== repeat) {
      setError('The two passwords don’t match.');
      return;
    }
    setWorking(true);
    void (async () => {
      try {
        let user = firebaseUser;
        if (!user) {
          const [auth, { signInWithEmailLink }] = await Promise.all([
            getFirebaseAuth(),
            import('firebase/auth'),
          ]);
          try {
            user = (await signInWithEmailLink(auth, email.trim(), link)).user;
          } catch (err) {
            setError(resetErrorMessage(err));
            return;
          }
          setFirebaseUser(user);
        }
        const idToken = await user.getIdToken();
        await reset.mutateAsync({
          idToken,
          newPassword: password,
          ...(code.trim() ? { code: code.trim() } : {}),
        });
        window.localStorage.removeItem(RESET_EMAIL_KEY);
        const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), import('firebase/auth')]);
        await signOut(auth);
        setDone(true);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Could not reset your password. Try again.',
        );
      } finally {
        setWorking(false);
      }
    })();
  };

  if (done) {
    return (
      <AuthShell title="Password changed">
        <p className="mb-4 text-sm text-neutral-700 dark:text-dark-muted">
          Your new password is set and every other session has been signed out.
        </p>
        <Link
          to="/login"
          className="block w-full rounded-full bg-accent px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          Sign in
        </Link>
      </AuthShell>
    );
  }

  if (linkState === 'checking') {
    return (
      <AuthShell>
        <p className="text-sm text-neutral-600 dark:text-dark-muted">Checking your link…</p>
      </AuthShell>
    );
  }

  if (linkState === 'invalid') {
    return (
      <AuthShell title="This link doesn’t work">
        <p className="mb-4 text-sm text-neutral-700 dark:text-dark-muted">
          It may be incomplete, expired or already used.
        </p>
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-accent-700 hover:underline dark:text-dark-accent"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit}>
        {askEmail ? (
          <TextField
            label="Confirm your email address"
            type="email"
            required
            autoComplete="email"
            disabled={firebaseUser !== null}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        ) : (
          <p className="mb-4 text-sm text-neutral-700 dark:text-dark-muted">
            For <strong className="text-neutral-900 dark:text-dark-text">{email}</strong>
          </p>
        )}
        <TextField
          label="New password (12+ characters)"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <TextField
          label="Repeat new password"
          type="password"
          required
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
          }}
        />
        <TextField
          label="Two-factor code (only if you use it)"
          autoComplete="one-time-code"
          inputMode="text"
          placeholder="Authenticator code or recovery code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
        {error ? (
          <p role="alert" className="mb-4 text-sm text-accent-700 dark:text-dark-accent">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={working} className="w-full">
          {working ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </AuthShell>
  );
}
