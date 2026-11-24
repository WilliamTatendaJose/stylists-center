import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { getFirebaseAuth } from '../firebase';
import { RESET_EMAIL_KEY, resetErrorMessage, resetLinkUrl } from '../passwordReset';

/**
 * Step 1 of "forgot password": Firebase emails a one-time sign-in link to the
 * address. Opening it proves the person controls the inbox; the API then
 * decides whether that address is an active staff account (ResetPasswordPage).
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const address = email.trim();
    setError(null);
    setSending(true);
    void (async () => {
      try {
        const [auth, { sendSignInLinkToEmail }] = await Promise.all([
          getFirebaseAuth(),
          import('firebase/auth'),
        ]);
        await sendSignInLinkToEmail(auth, address, {
          url: resetLinkUrl(window.location.origin),
          handleCodeInApp: true,
        });
        window.localStorage.setItem(RESET_EMAIL_KEY, address);
        setSentTo(address);
      } catch (err) {
        setError(resetErrorMessage(err));
      } finally {
        setSending(false);
      }
    })();
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your email">
        <p className="mb-3 text-sm text-neutral-700 dark:text-dark-muted">
          We sent a link to{' '}
          <strong className="text-neutral-900 dark:text-dark-text">{sentTo}</strong>. If it belongs
          to a staff account, the link lets you choose a new password.
        </p>
        <p className="mb-4 text-sm text-neutral-600 dark:text-dark-muted">
          Open it on this computer within 15 minutes of signing in to it. It can only be used once.
          Not there? Check your spam folder.
        </p>
        <Link
          to="/login"
          className="text-sm font-medium text-accent-700 hover:underline dark:text-dark-accent"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password">
      <form onSubmit={submit}>
        <p className="mb-4 text-sm text-neutral-700 dark:text-dark-muted">
          Enter the email address you sign in with. We’ll email you a link to set a new password.
        </p>
        <TextField
          label="Email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        {error ? (
          <p role="alert" className="mb-4 text-sm text-accent-700 dark:text-dark-accent">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={sending} className="w-full">
          {sending ? 'Sending…' : 'Email me a link'}
        </Button>
        <Link
          to="/login"
          className="mt-3 block text-center text-sm text-neutral-600 hover:underline dark:text-dark-muted"
        >
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
