const TONE_CLASSES = {
  neutral: 'bg-neutral-200 text-neutral-700 dark:bg-white/10 dark:text-dark-muted',
  accent: 'bg-accent-100 text-accent-700 dark:bg-accent/15 dark:text-dark-accent',
  dark: 'bg-neutral-900 text-white dark:bg-white/15 dark:text-dark-text',
} as const;

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
