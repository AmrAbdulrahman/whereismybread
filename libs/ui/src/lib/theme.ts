export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'wib:theme';

/** SSR default — matches the `dark` class the root layout renders. */
const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

export function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Reflect a theme onto `<html>` (class + color-scheme). */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  const el = document.documentElement;
  el.classList.toggle('dark', resolved === 'dark');
  el.style.colorScheme = resolved;
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / disabled storage — the in-memory choice still applies */
  }
}

/**
 * Runs before paint (inlined in the document head) so the correct theme is on
 * `<html>` before the first render — no flash. Mirrors the helpers above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"&&t!=="system")t=${JSON.stringify(
  DEFAULT_THEME,
)};var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
