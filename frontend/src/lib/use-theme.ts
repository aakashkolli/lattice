'use client';

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'lattice_theme';

function getPreferredTheme(): Theme {
  const stored = typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEY)
    : null;
  if (stored === 'light' || stored === 'dark') return stored;
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const initial = getPreferredTheme();
    setTheme(initial);
    applyTheme(initial);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if there is no localStorage override
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== 'light' && stored !== 'dark') {
        const next: Theme = e.matches ? 'dark' : 'light';
        setTheme(next);
        applyTheme(next);
      }
    };

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
