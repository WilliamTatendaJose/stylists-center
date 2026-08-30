import { useState } from 'react';
import type { ActiveRole, AdminUserRowDto } from '@sc/shared';
import { ApiError } from '../api/client';
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '../api/users';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';

const PAGE_SIZE = 50;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const createUser = useCreateUser();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="mb-6">
      <h2 className="mb-4 font-semibold text-neutral-900 dark:text-dark-text">Create app user</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <TextField
          label="Display name"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
        />
        <TextField
          label="Temporary password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          disabled={createUser.isPending}
          onClick={() => {
            setError(null);
            createUser.mutate(
              { email: email.trim(), displayName: displayName.trim(), password },
              {
                onSuccess: onDone,
                onError: (cause) => {
                  setError(errorMessage(cause, 'Could not create user.'));
                },
              },
            );
          }}
        >
          {createUser.isPending ? 'Creating…' : 'Create user'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function EditUserForm({ user, onDone }: { user: AdminUserRowDto; onDone: () => void }) {
  const updateUser = useUpdateUser(user.id);
  const [email, setEmail] = useState(user.email ?? '');
  const [displayName, setDisplayName] = useState(user.displayName);
  const [activeRole, setActiveRole] = useState<ActiveRole>(user.activeRole);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4 rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <div className="grid gap-3 md:grid-cols-4">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
        />
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-dark-muted">
            Active role
          </span>
          <select
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
            value={activeRole}
            onChange={(e) => {
              setActiveRole(e.target.value as ActiveRole);
            }}
          >
            <option value="client">Client</option>
            <option value="provider" disabled={!user.hasProviderProfile}>
              Provider
            </option>
          </select>
        </label>
        <TextField
          label="New password (optional)"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </div>
      {error ? <p className="mb-3 text-sm text-accent-700 dark:text-dark-accent">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          disabled={updateUser.isPending}
          onClick={() => {
            setError(null);
            updateUser.mutate(
              {
                email: email.trim(),
                displayName: displayName.trim(),
                activeRole,
                ...(password ? { password } : {}),
              },
              {
                onSuccess: onDone,
                onError: (cause) => {
                  setError(errorMessage(cause, 'Could not update user.'));
                },
              },
            );
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function UserRow({ user }: { user: AdminUserRowDto }) {
  const updateUser = useUpdateUser(user.id);
  const deleteUser = useDeleteUser(user.id);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDeleted = user.appStatus === 'deleted';

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-dark-text">{user.displayName}</p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">
            {user.email ?? user.phone ?? 'Personal details removed'}
          </p>
          <p className="mt-1 break-all text-xs text-neutral-500 dark:text-dark-muted">
            Firebase UID: {user.firebaseUid ?? 'none'}
          </p>
          {error ? (
            <p className="mt-2 text-sm text-accent-700 dark:text-dark-accent">{error}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={user.activeRole} tone="neutral" />
          <Badge
            label={`App: ${user.appStatus}`}
            tone={user.appStatus === 'active' ? 'neutral' : 'accent'}
          />
          <Badge
            label={`Firebase: ${user.firebaseStatus}`}
            tone={user.firebaseStatus === 'active' ? 'neutral' : 'accent'}
          />
          {!isDeleted ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing((value) => !value);
                }}
              >
                {editing ? 'Close' : 'Edit'}
              </Button>
              <Button
                variant={user.appStatus === 'disabled' ? 'secondary' : 'danger'}
                disabled={updateUser.isPending}
                onClick={() => {
                  setError(null);
                  updateUser.mutate(
                    { disabled: user.appStatus !== 'disabled' },
                    {
                      onError: (cause) => {
                        setError(errorMessage(cause, 'Could not update access.'));
                      },
                    },
                  );
                }}
              >
                {user.appStatus === 'disabled' ? 'Enable' : 'Disable'}
              </Button>
              <Button
                variant="danger"
                disabled={deleteUser.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete ${user.email ?? user.displayName} from Firebase and the app? This cannot be undone.`,
                    )
                  )
                    return;
                  setError(null);
                  deleteUser.mutate(undefined, {
                    onError: (cause) => {
                      setError(errorMessage(cause, 'Could not delete user.'));
                    },
                  });
                }}
              >
                {deleteUser.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </>
          ) : user.firebaseUid ? (
            <Button
              variant="danger"
              disabled={deleteUser.isPending}
              onClick={() => {
                setError(null);
                deleteUser.mutate(undefined, {
                  onError: (cause) => {
                    setError(errorMessage(cause, 'Could not finish Firebase cleanup.'));
                  },
                });
              }}
            >
              {deleteUser.isPending ? 'Cleaning up…' : 'Retry Firebase cleanup'}
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <EditUserForm
          user={user}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function UsersPage() {
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useUsers({
    query,
    limit: PAGE_SIZE,
    offset,
    includeDeleted,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-neutral-900 dark:text-dark-text">Users</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-dark-muted">
            Firebase credentials and app accounts in one place.
          </p>
        </div>
        {!creating ? (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            Add user
          </Button>
        ) : null}
      </div>

      {creating ? (
        <CreateUserForm
          onDone={() => {
            setCreating(false);
          }}
        />
      ) : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <TextField
              label="Search name, email, phone or Firebase UID"
              value={draftQuery}
              onChange={(event) => {
                setDraftQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setQuery(draftQuery.trim());
                  setOffset(0);
                }
              }}
            />
          </div>
          <Button
            onClick={() => {
              setQuery(draftQuery.trim());
              setOffset(0);
            }}
          >
            Search
          </Button>
          <label className="mb-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-dark-muted">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) => {
                setIncludeDeleted(event.target.checked);
                setOffset(0);
              }}
            />
            Show deleted
          </label>
        </div>
      </Card>

      {isLoading ? <p className="text-sm text-neutral-600 dark:text-dark-muted">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-accent-700 dark:text-dark-accent">Couldn&apos;t load users.</p>
      ) : null}
      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {data?.items.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </div>
      {data?.items.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600 dark:text-dark-muted">No users found.</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-600 dark:text-dark-muted">
        <span>
          {data
            ? `${String(offset + 1)}–${String(Math.min(offset + data.items.length, data.total))} of ${String(data.total)}`
            : ''}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - PAGE_SIZE));
            }}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={!data || offset + PAGE_SIZE >= data.total}
            onClick={() => {
              setOffset(offset + PAGE_SIZE);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
