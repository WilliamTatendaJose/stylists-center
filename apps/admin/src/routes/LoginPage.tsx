import { useState, type SubmitEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';

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
          <h1 className="text-xl font-bold text-neutral-900 dark:text-dark-text">
            Stylists Center
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">Admin console</p>
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
