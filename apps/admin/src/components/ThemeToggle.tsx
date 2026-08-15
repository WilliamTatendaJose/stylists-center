import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../state/themeStore';

/**
 * A simple light/dark toggle rather than a three-way light/dark/system
 * picker — "system" is still the default until the user overrides it
 * (see themeStore's initial state), this control just gives the explicit
 * override a one-click home instead of a menu.
 */
export function ThemeToggle() {
  const isDark = useThemeStore((s) => s.isDark);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        setPreference(isDark ? 'light' : 'dark');
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-dark-muted dark:hover:bg-white/10"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
