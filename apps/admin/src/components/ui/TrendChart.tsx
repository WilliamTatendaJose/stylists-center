/** Plain CSS bars, not SVG/canvas — 14 points never need more than flexbox math, and it stays theme-aware for free. */
export function TrendChart({
  points,
  valueFormatter,
}: {
  points: { date: string; value: number }[];
  valueFormatter: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <div className="flex h-32 items-end gap-1">
      {points.map((p) => (
        <div key={p.date} className="group relative flex-1">
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-white dark:text-neutral-900">
            {new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
            {valueFormatter(p.value)}
          </div>
          <div
            className="rounded-t bg-accent/70 transition-all group-hover:bg-accent dark:bg-dark-accent/60 dark:group-hover:bg-dark-accent"
            style={{ height: `${String(Math.max(2, (p.value / max) * 100))}%` }}
          />
        </div>
      ))}
    </div>
  );
}
