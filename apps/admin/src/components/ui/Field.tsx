import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const fieldChrome =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent focus:outline-none dark:border-dark-border dark:bg-white/5 dark:text-dark-text dark:placeholder:text-neutral-600 dark:focus:border-accent';

const labelChrome = 'mb-1 block text-sm font-medium text-neutral-700 dark:text-dark-muted';

export function TextField({
  label,
  className = '',
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <span className={labelChrome}>{label}</span>
      <input className={`${fieldChrome} ${className}`} {...props} />
    </label>
  );
}

export function TextAreaField({
  label,
  className = '',
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="mb-4 block">
      <span className={labelChrome}>{label}</span>
      <textarea className={`${fieldChrome} ${className}`} {...props} />
    </label>
  );
}
