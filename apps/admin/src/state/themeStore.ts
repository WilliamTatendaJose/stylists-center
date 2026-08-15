import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'sc-admin-theme';

function resolveIsDark(preference: ThemePreference): boolean {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return preference === 'dark';
}

function applyTheme(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
}

interface ThemeState {
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

const initialPreference = readStoredPreference();
const initialIsDark = resolveIsDark(initialPreference);
applyTheme(initialIsDark);

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initialPreference,
  isDark: initialIsDark,
  setPreference: (preference) => {
    localStorage.setItem(STORAGE_KEY, preference);
    const isDark = resolveIsDark(preference);
    applyTheme(isDark);
    set({ preference, isDark });
  },
}));

// Only matters while "system" is selected — a preference of "light"/"dark"
// is an explicit override the OS-level change shouldn't silently undo.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (useThemeStore.getState().preference !== 'system') return;
  applyTheme(e.matches);
  useThemeStore.setState({ isDark: e.matches });
});
