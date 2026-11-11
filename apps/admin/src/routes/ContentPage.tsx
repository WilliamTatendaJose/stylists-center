import { useEffect, useState } from 'react';
import type { ContentDocumentDto } from '@sc/shared';
import { useContentDocuments, useSaveContentDocument } from '../api/settings';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useAuthStore } from '../state/authStore';

function DocumentEditor({ doc, canEdit }: { doc: ContentDocumentDto; canEdit: boolean }) {
  const save = useSaveContentDocument();
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the saved text when switching documents or after a save.
  useEffect(() => {
    setTitle(doc.title);
    setBody(doc.body);
  }, [doc.key, doc.version, doc.title, doc.body]);

  const changed = title !== doc.title || body !== doc.body;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {doc.isPlaceholder ? (
          <Badge label="Placeholder: not yet provided" tone="accent" />
        ) : (
          <Badge label={`Version ${String(doc.version)}`} />
        )}
        {doc.updatedAt && (
          <span className="text-xs text-neutral-500 dark:text-dark-muted">
            Last saved {new Date(doc.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <TextField
        label="Title"
        value={title}
        disabled={!canEdit}
        maxLength={160}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
      />
      <TextAreaField
        label="Text"
        value={body}
        disabled={!canEdit}
        rows={20}
        className="font-mono"
        onChange={(e) => {
          setBody(e.target.value);
        }}
      />
      <p className="mb-4 text-xs text-neutral-500 dark:text-dark-muted">
        Plain text. Leave a blank line between paragraphs. Users see the new text in the app as soon
        as it is saved; no app update is needed.
      </p>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button
            disabled={!changed || save.isPending || !title.trim() || !body.trim()}
            onClick={() => {
              setMessage(null);
              setError(null);
              save.mutate(
                { key: doc.key, title, body },
                {
                  onSuccess: (saved) => {
                    setMessage(`Saved as version ${String(saved.version)}.`);
                  },
                  onError: (err) => {
                    setError(err instanceof ApiError ? err.message : 'Could not save.');
                  },
                },
              );
            }}
          >
            Save
          </Button>
          {message && (
            <span className="text-sm text-neutral-600 dark:text-dark-muted">{message}</span>
          )}
          {error && <span className="text-sm text-accent-700 dark:text-dark-accent">{error}</span>}
        </div>
      )}
    </Card>
  );
}

export function ContentPage() {
  const { data, isLoading, error } = useContentDocuments();
  const role = useAuthStore((s) => s.admin?.role);
  const canEdit = role === 'owner';
  const [selected, setSelected] = useState<string | null>(null);
  const current = data?.find((doc) => doc.key === selected) ?? data?.[0];

  return (
    <div>
      <h1 className="mb-2 text-lg font-bold text-neutral-900 dark:text-dark-text">
        Terms and privacy
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-neutral-600 dark:text-dark-muted">
        The Terms and Conditions for each kind of user and the privacy policy shown in the apps.
        Until a document is saved here, the apps show a placeholder saying the final wording is
        coming. Support contacts are on the Settings page.
        {!canEdit && ' Only owners can change these.'}
      </p>
      {isLoading && <div className="text-neutral-600 dark:text-dark-muted">Loading…</div>}
      {error && <div className="text-accent-700">Could not load documents.</div>}
      {data && current && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
          <nav className="flex flex-col gap-1">
            {data.map((doc) => (
              <button
                key={doc.key}
                type="button"
                onClick={() => {
                  setSelected(doc.key);
                }}
                className={`rounded-lg px-3 py-2 text-left text-sm ${
                  doc.key === current.key
                    ? 'bg-accent-100 font-semibold text-accent-700 dark:bg-accent/15 dark:text-dark-accent'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-dark-muted dark:hover:bg-white/5'
                }`}
              >
                {doc.title}
                {doc.isPlaceholder && (
                  <span className="ml-1 text-xs opacity-70">(placeholder)</span>
                )}
              </button>
            ))}
          </nav>
          <DocumentEditor doc={current} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}
