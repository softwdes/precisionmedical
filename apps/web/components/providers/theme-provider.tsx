'use client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/trpc/client';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => undefined,
  setTheme: () => undefined,
});

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}): React.ReactElement {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const updatePreferences = api.users.updatePreferences.useMutation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.cookie = `theme=${theme};path=/;max-age=31536000`;
  }, [theme]);

  const setTheme = (newTheme: Theme): void => {
    setThemeState(newTheme);
    updatePreferences.mutate({ preferredTheme: newTheme });
  };

  const toggleTheme = (): void => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
