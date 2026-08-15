import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white dark:border-dark-border dark:bg-dark-surface ${
        padded ? 'p-6' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
