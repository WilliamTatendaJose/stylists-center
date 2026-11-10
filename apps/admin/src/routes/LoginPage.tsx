import { useState, type SubmitEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { useLogin, useMfaLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { BrandLogo } from '../components/BrandLogo';

export function LoginPage() {
  const admin = useAuthStore((s) => s.admin);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const login = useLogin();
  const mfaLogin = useMfaLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Set once the password is accepted for an account with 2FA. */
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  if (!isBootstrapping && admin) {
    return <Navigate to="/overview" replace />;
  }

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        onSuccess: (result) => {
          if ('mfaRequired' in result) setMfaToken(result.mfaToken);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
        },
      },
    );
  };

  const submitCode = (e: SubmitEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    mfaLogin.mutate(
      { mfaToken, code },
      {
        onError: (err) => {
          // An expired challenge (5 min) means starting over from the password.
          if (err instanceof ApiError && /timed out/i.test(err.message)) {
            setMfaToken(null);
            setCode('');
          }
          setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
        },
      },
    );
  };

  const errorLine = error ? (
    <p role="alert" className="mb-4 text-sm text-accent-700 dark:text-dark-accent">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-dark-bg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto w-64 max-w-full rounded-xl" />
          <p className="mt-3 text-sm font-medium tracking-wide text-neutral-600 uppercase dark:text-dark-muted">
            Admin console
          </p>
        </div>

        <Card>
          {mfaToken ? (
            <form onSubmit={submitCode}>
              <p className="mb-4 text-sm text-neutral-700 dark:text-dark-muted">
                Enter the 6-digit code from your authenticator app, or one of your recovery codes.
              </p>
              <TextField
                label="Code"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
              />
              {errorLine}
              <Button type="submit" disabled={mfaLogin.isPending} className="w-full">
                {mfaLogin.isPending ? 'Checking…' : 'Verify'}
              </Button>
              <button
                type="button"
                className="mt-3 w-full text-sm text-neutral-600 hover:underline dark:text-dark-muted"
                onClick={() => {
                  setMfaToken(null);
                  setCode('');
                  setError(null);
                }}
              >
                Use a different account
              </button>
            </form>
          ) : (
            <form onSubmit={submit}>
              <TextField
                label="Email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
              <TextField
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />

              {errorLine}

              <Button type="submit" disabled={login.isPending} className="w-full">
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
