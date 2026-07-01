import { create } from 'zustand';

type ThemeMode = 'dark' | 'light';

type ThemeStore = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const storageKey = 'trapmap-theme';

function getInitialTheme(): ThemeMode {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    }
  } catch {
    // Ignore storage errors and fall back to dark.
  }

  return 'dark';
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, theme);
    }
    set({ theme });
  },
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, nextTheme);
    }
    set({ theme: nextTheme });
  },
}));
