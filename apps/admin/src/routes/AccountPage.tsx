import { useEffect, useState, type SubmitEvent } from 'react';
import QRCode from 'qrcode';
import type { AdminMfaSetup } from '@sc/shared';
import { useAuthStore } from '../state/authStore';
import {
  useChangePassword,
  useMfaDisable,
  useMfaEnable,
  useMfaSetup,
  useRegenerateRecoveryCodes,
} from '../api/auth';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Shown once after enabling or regenerating; the server only keeps hashes. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  return (
    <div className="mt-4 rounded-lg border border-accent/40 bg-accent-100/40 p-4 dark:bg-accent/10">
      <p className="text-sm font-semibold text-neutral-900 dark:text-dark-text">
        Save these recovery codes now
      </p>
      <p className="mt-1 text-sm text-neutral-700 dark:text-dark-muted">
        Each one signs you in once if you lose your phone. They won&apos;t be shown again.
      </p>
      <pre className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-neutral-900 dark:text-dark-text">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(text);
          }}
        >
          Copy
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'stylists-center-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
        <Button onClick={onDone}>I&apos;ve saved them</Button>
      </div>
    </div>
  );
}

function EnrolMfa({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const [pending, setPending] = useState<AdminMfaSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    // Rendered locally: the secret never leaves the browser for a QR service.
    void QRCode.toDataURL(pending.otpauthUrl, { margin: 1, width: 200 }).then(setQr);
  }, [pending]);

  if (!pending) {
    return (
      <div className="mt-4">
        {error ? (
          <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
        ) : null}
        <Button
          disabled={setup.isPending}
          onClick={() => {
            setError(null);
            setup.mutate(undefined, {
              onSuccess: setPending,
              onError: (err) => {
                setError(errorText(err, 'Could not start setup.'));
              },
            });
          }}
        >
          {setup.isPending ? 'Starting…' : 'Set up two-factor sign-in'}
        </Button>
      </div>
    );
  }

  const confirm = (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    enable.mutate(code, {
      // Lifted to the page: enabling flips admin.mfaEnabled, which swaps this
      // form for ManageMfa and would discard codes held in local state.
      onSuccess: (result) => {
        onCodes(result.recoveryCodes);
        useAuthStore.getState().updateAdmin({ mfaEnabled: true, mfaSetupRequired: false });
      },
      onError: (err) => {
        setError(errorText(err, 'Could not turn on two-factor sign-in.'));
      },
    });
  };

  return (
    <form onSubmit={confirm} className="mt-4 space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-dark-muted">
        <li>
          Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
        </li>
        <li>Scan this QR code, or enter the key by hand.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-6">
        {qr ? (
          <img
            src={qr}
            alt="QR code for your authenticator app"
            className="h-44 w-44 rounded bg-white p-1"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-xs text-neutral-500 dark:text-dark-muted">Key</p>
          <p className="break-all font-mono text-sm text-neutral-900 dark:text-dark-text">
            {pending.secret.replace(/(.{4})/g, '$1 ').trim()}
          </p>
        </div>
      </div>
      <div className="max-w-xs">
        <TextField
          label="6-digit code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ''));
          }}
        />
      </div>
      {error ? <p className="text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <Button type="submit" disabled={enable.isPending || code.length !== 6}>
        {enable.isPending ? 'Checking…' : 'Turn on'}
      </Button>
    </form>
  );
}

function ManageMfa({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const regenerate = useRegenerateRecoveryCodes();
  const disable = useMfaDisable();
  const [mode, setMode] = useState<'idle' | 'codes' | 'disable'>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode('idle');
    setCode('');
    setPassword('');
    setError(null);
  };

  return (
    <div className="mt-4">
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setMode('codes');
            }}
          >
            New recovery codes
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setMode('disable');
            }}
          >
            Turn off
          </Button>
        </div>
      ) : (
        <form
          className="max-w-sm"
          onSubmit={(e: SubmitEvent) => {
            e.preventDefault();
            setError(null);
            if (mode === 'codes') {
              regenerate.mutate(code, {
                onSuccess: (r) => {
                  reset();
                  onCodes(r.recoveryCodes);
                },
                onError: (err) => {
                  setError(errorText(err, 'Could not create new codes.'));
                },
              });
            } else {
              disable.mutate(
                { password, code },
                {
                  onSuccess: reset,
                  onError: (err) => {
                    setError(errorText(err, 'Could not turn it off.'));
                  },
                },
              );
            }
          }}
        >
          {mode === 'disable' ? (
            <TextField
              label="Your password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          ) : null}
          <TextField
            label="Current authenticator code or a recovery code"
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
          {mode === 'codes' ? (
            <p className="mb-4 text-sm text-neutral-600 dark:text-dark-muted">
              Your old recovery codes stop working.
            </p>
          ) : null}
          {error ? (
            <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={mode === 'disable' ? 'danger' : 'primary'}
              disabled={regenerate.isPending || disable.isPending}
            >
              {mode === 'disable' ? 'Turn off two-factor sign-in' : 'Create new codes'}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ChangePassword() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          setDone(true);
        },
        onError: (err) => {
          setError(errorText(err, 'Could not change your password.'));
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="mt-4 max-w-sm">
      <TextField
        label="Current password"
        type="password"
        required
        autoComplete="current-password"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
        }}
      />
      <TextField
        label="New password (12+ characters)"
        type="password"
        required
        minLength={12}
        autoComplete="new-password"
        value={next}
        onChange={(e) => {
          setNext(e.target.value);
        }}
      />
      <TextField
        label="Repeat new password"
        type="password"
        required
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
        }}
      />
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      {done ? (
        <p role="status" className="mb-3 text-sm text-neutral-700 dark:text-dark-muted">
          Password changed. You&apos;ve been signed out everywhere else.
        </p>
      ) : null}
      <Button type="submit" disabled={change.isPending}>
        {change.isPending ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  );
}

export function AccountPage() {
  const admin = useAuthStore((s) => s.admin);
  const [codes, setCodes] = useState<string[] | null>(null);
  if (!admin) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Your account</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
          {admin.displayName} · {admin.email}
        </p>
      </div>

      {admin.mfaSetupRequired ? (
        <div
          role="alert"
          className="rounded-lg border border-accent/50 bg-accent-100/50 px-4 py-3 text-sm text-neutral-900 dark:bg-accent/10 dark:text-dark-text"
        >
          Two-factor sign-in is required for admin accounts. Set it up below to use the rest of the
          console.
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-neutral-900 dark:text-dark-text">Two-factor sign-in</h2>
          <Badge
            label={admin.mfaEnabled ? 'On' : 'Off'}
            tone={admin.mfaEnabled ? 'dark' : 'accent'}
          />
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
          A code from your phone at every sign-in, so a stolen password alone can&apos;t get into
          the console.
        </p>
        {codes ? (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes(null);
            }}
          />
        ) : admin.mfaEnabled ? (
          <ManageMfa onCodes={setCodes} />
        ) : (
          <EnrolMfa onCodes={setCodes} />
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-neutral-900 dark:text-dark-text">Password</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
          Changing it signs you out on every other device.
        </p>
        <ChangePassword />
      </Card>
    </div>
  );
}
