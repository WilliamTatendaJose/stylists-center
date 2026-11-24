import type { ReactNode } from 'react';
import { BrandLogo } from './BrandLogo';
import { Card } from './ui/Card';

/** The centred logo-and-card layout shared by the sign-in and password-reset pages. */
export function AuthShell({ title, children }: { title?: string; children: ReactNode }) {
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
          {title ? (
            <h1 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-dark-text">
              {title}
            </h1>
          ) : null}
          {children}
        </Card>
      </div>
    </div>
  );
}
