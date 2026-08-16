import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-white/10 dark:text-dark-text dark:hover:bg-white/15',
  ghost:
    'bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-dark-muted dark:hover:bg-white/5',
  danger:
    'bg-transparent text-accent-700 hover:bg-accent-100 dark:text-dark-accent dark:hover:bg-white/5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
