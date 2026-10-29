import { useState } from 'react';

export type Theme = 'light' | 'dark';

const storageKey = 'planciait.theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // Storage can be blocked (private windows, site data policies): fall back to the system.
    return null;
  }
}

/** The theme chosen by the user on this browser, otherwise the system preference. */
export function initialTheme(): Theme {
  const stored = storedTheme();
  if (stored) return stored;
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Not remembered: the choice still applies until the page is reloaded.
    }
  }
  return [theme, toggle];
}
