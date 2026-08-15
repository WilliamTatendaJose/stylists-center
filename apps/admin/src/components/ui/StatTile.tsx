import type { ReactNode } from 'react';
import { Card } from './Card';

export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <Card className="flex items-center gap-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          tone === 'accent'
            ? 'bg-accent-100 text-accent-700 dark:bg-accent/15 dark:text-dark-accent'
            : 'bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-dark-muted'
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-neutral-900 dark:text-dark-text">{value}</p>
        <p className="text-sm text-neutral-600 dark:text-dark-muted">{label}</p>
      </div>
    </Card>
  );
}
