import { useState } from 'react';
import type { AdminStaffRowDto } from '@sc/shared';
import { useAuthStore } from '../state/authStore';
import { useCreateStaff, useStaff, useUpdateStaff } from '../api/staff';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';

function CreateStaffForm({ onDone }: { onDone: () => void }) {
  const createStaff = useCreateStaff();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    createStaff.mutate(
      { email: email.trim(), displayName: displayName.trim(), password },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not create account.');
        },
      },
    );
  };

  return (
    <Card className="mb-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <TextField
          label="Name"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
        />
        <TextField
          label="Temporary password"
          type="text"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={createStaff.isPending}>
          {createStaff.isPending ? 'Creating…' : 'Create account'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function ResetPasswordForm({ staffId, onDone }: { staffId: string; onDone: () => void }) {
  const updateStaff = useUpdateStaff(staffId);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError(null);
    updateStaff.mutate(
      { password },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not reset password.');
        },
      },
    );
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <TextField
        label="New password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <Button onClick={submit} disabled={updateStaff.isPending}>
        Save
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {error ? (
        <p className="w-full text-sm text-accent-700 dark:text-dark-accent">{error}</p>
      ) : null}
    </div>
  );
}

function StaffRow({ staff }: { staff: AdminStaffRowDto }) {
  const currentAdmin = useAuthStore((s) => s.admin);
  const updateStaff = useUpdateStaff(staff.id);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelf = currentAdmin?.id === staff.id;

  const toggleDisabled = () => {
    setError(null);
    updateStaff.mutate(
      { disabled: !staff.disabled },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not update.');
        },
      },
    );
  };

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-dark-text">
            {staff.displayName}{' '}
            {isSelf ? <span className="text-neutral-500 dark:text-dark-muted">(you)</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">{staff.email}</p>
          {error ? (
            <p className="mt-1 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Badge
            label={staff.disabled ? 'Disabled' : 'Active'}
            tone={staff.disabled ? 'accent' : 'neutral'}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setResetting((v) => !v);
            }}
          >
            {resetting ? 'Close' : 'Reset password'}
          </Button>
          <Button
            variant={staff.disabled ? 'secondary' : 'danger'}
            onClick={toggleDisabled}
            disabled={updateStaff.isPending || isSelf}
            title={isSelf ? 'You cannot disable your own account' : undefined}
          >
            {staff.disabled ? 'Enable' : 'Disable'}
          </Button>
        </div>
      </div>

      {resetting ? (
        <ResetPasswordForm
          staffId={staff.id}
          onDone={() => {
            setResetting(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function StaffPage() {
  const { data: staff, isLoading, isError } = useStaff();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Staff</h1>
        {!creating ? (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            Add staff
          </Button>
        ) : null}
      </div>

      {creating ? (
        <CreateStaffForm
          onDone={() => {
            setCreating(false);
          }}
        />
      ) : null}

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load staff.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {staff?.map((s) => (
          <StaffRow key={s.id} staff={s} />
        ))}
      </div>
    </div>
  );
}
