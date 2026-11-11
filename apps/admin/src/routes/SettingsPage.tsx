import { useState } from 'react';
import { formatUsd, type AdminSettingDto } from '@sc/shared';
import { useSettings, useUpdateSetting } from '../api/settings';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuthStore } from '../state/authStore';

const SOURCE_LABELS: Record<AdminSettingDto['source'], string> = {
  console: 'Set here',
  environment: 'Environment variable',
  default: 'Built-in default',
};

/** How a stored value reads to staff: money as dollars, the rest as plain numbers or text. */
export function displaySetting(kind: AdminSettingDto['kind'], value: number | string): string {
  if (kind === 'text') return value === '' ? 'Not set' : String(value);
  const num = Number(value);
  switch (kind) {
    case 'cents':
      return formatUsd(num);
    case 'usd':
      return formatUsd(num * 100);
    case 'coins':
      return `${String(num)} coin${num === 1 ? '' : 's'}`;
    case 'days':
      return `${String(num)} day${num === 1 ? '' : 's'}`;
  }
}

/** What goes in the edit box: dollars for money stored in cents. */
function toInput(kind: AdminSettingDto['kind'], value: number | string): string {
  if (kind === 'cents') return (Number(value) / 100).toFixed(2);
  return String(value);
}

/** Back to the stored form, or an error message. */
export function fromInput(
  kind: AdminSettingDto['kind'],
  raw: string,
): { ok: true; value: number | string } | { ok: false; error: string } {
  if (kind === 'text') return { ok: true, value: raw.trim() };
  const trimmed = raw.trim().replace(/^\$/, '');
  if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
    return { ok: false, error: 'Enter a number' };
  }
  if (kind === 'cents') {
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed))
      return { ok: false, error: 'Enter dollars and cents, e.g. 5.00' };
    return { ok: true, value: Math.round(Number(trimmed) * 100) };
  }
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Enter a whole number' };
  return { ok: true, value: Number(trimmed) };
}

function SettingRow({ setting, canEdit }: { setting: AdminSettingDto; canEdit: boolean }) {
  const update = useUpdateSetting();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = (value: number | string | null) => {
    setError(null);
    update.mutate(
      { key: setting.key, value },
      {
        onSuccess: () => {
          setEditing(false);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not save.');
        },
      },
    );
  };

  const unit = setting.kind === 'cents' || setting.kind === 'usd' ? 'USD' : '';

  return (
    <div className="border-t border-neutral-100 py-4 first:border-t-0 dark:border-dark-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-neutral-900 dark:text-dark-text">{setting.label}</div>
          <div className="mt-0.5 text-sm text-neutral-600 dark:text-dark-muted">{setting.help}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-dark-muted">
            <Badge
              label={SOURCE_LABELS[setting.source]}
              tone={setting.source === 'console' ? 'accent' : 'neutral'}
            />
            <span>
              Environment variable <code className="font-mono">{setting.env}</code>
            </span>
            {setting.source === 'console' && (
              <span>
                · without the value set here: {displaySetting(setting.kind, setting.fallbackValue)}
              </span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-neutral-900 dark:text-dark-text">
              {displaySetting(setting.kind, setting.value)}
            </span>
            {canEdit && (
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(toInput(setting.kind, setting.value));
                  setError(null);
                  setEditing(true);
                }}
              >
                Change
              </Button>
            )}
            {canEdit && setting.source === 'console' && (
              <Button
                variant="ghost"
                disabled={update.isPending}
                onClick={() => {
                  save(null);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            aria-label={setting.label}
            value={draft}
            maxLength={setting.maxLength}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            className="w-64 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text"
          />
          {unit && <span className="text-sm text-neutral-500">{unit}</span>}
          <Button
            disabled={update.isPending}
            onClick={() => {
              const parsed = fromInput(setting.kind, draft);
              if (!parsed.ok) {
                setError(parsed.error);
                return;
              }
              save(parsed.value);
            }}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      {error && <div className="mt-2 text-sm text-accent-700 dark:text-dark-accent">{error}</div>}
    </div>
  );
}

export function SettingsPage() {
  const { data, isLoading, error } = useSettings();
  const role = useAuthStore((s) => s.admin?.role);
  const canEdit = role === 'owner';

  const groups = new Map<string, AdminSettingDto[]>();
  for (const setting of data ?? []) {
    groups.set(setting.group, [...(groups.get(setting.group) ?? []), setting]);
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-bold text-neutral-900 dark:text-dark-text">Settings</h1>
      <p className="mb-6 max-w-3xl text-sm text-neutral-600 dark:text-dark-muted">
        Prices, rewards, limits and support contacts used across the apps. A value set here takes
        effect within about 30 seconds and overrides the environment variable. Reset removes it, so
        the environment variable (or the built-in default) applies again.
        {!canEdit && ' Only owners can change these.'}
      </p>
      {isLoading && <div className="text-neutral-600 dark:text-dark-muted">Loading…</div>}
      {error && <div className="text-accent-700">Could not load settings.</div>}
      <div className="space-y-6">
        {[...groups.entries()].map(([group, settings]) => (
          <Card key={group}>
            <h2 className="mb-2 font-semibold text-neutral-900 dark:text-dark-text">{group}</h2>
            {settings.map((setting) => (
              <SettingRow key={setting.key} setting={setting} canEdit={canEdit} />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
