import { create } from 'zustand';

/**
 * Theme store — placeholder for future theme support.
 * Currently only 'light' (NEXUS warm retro).
 * Dark mode should be implemented with proper CSS variables/Tailwind dark: classes,
 * not by overriding individual color values.
 */

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'light',
  setTheme: (theme) => {
    // TODO: Implement proper dark mode with CSS classes
    // document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    set({ theme });
  },
}));
