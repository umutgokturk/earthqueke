'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggle(): void;
  setTheme(theme: Theme): void;
}

/**
 * Kullanıcı tema tercihi — varsayılan açık tema; seçim tarayıcıda saklanır.
 * layout.tsx'teki küçük açılış betiği aynı anahtarı okuyarak ilk boyamada
 * doğru temayı uygular (tema titremesi olmaz).
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggle: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'ils-theme' },
  ),
);

/** data-theme özniteliğini <html> üzerinde günceller. */
export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}
