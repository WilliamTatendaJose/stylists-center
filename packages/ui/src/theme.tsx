import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { color, darkColor } from '@sc/tokens';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeColors = typeof color | typeof darkColor;

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode?: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  isDark: false,
  colors: color,
});

export function ThemeProvider({
  mode,
  onModeChange,
  children,
}: {
  mode: ThemeMode;
  onModeChange?: (mode: ThemeMode) => void;
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  return (
    <ThemeContext.Provider
      value={{ mode, isDark, colors: isDark ? darkColor : color, setMode: onModeChange }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
