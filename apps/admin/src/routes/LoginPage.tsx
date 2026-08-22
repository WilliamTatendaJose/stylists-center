import { useState, type SubmitEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { BrandLogo } from '../components/BrandLogo';

export function LoginPage() {
  const admin = useAuthStore((s) => s.admin);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isBootstrapping && admin) {
    return <Navigate to="/overview" replace />;
  }

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
        },
      },
    );
  };

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

            {error ? (
              <p role="alert" className="mb-4 text-sm text-accent-700 dark:text-dark-accent">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
