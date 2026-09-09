export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'wib:theme';

/**
 * Browser-UI colour (`<meta name="theme-color">`) per resolved theme — the
 * iOS/Android status-bar + notch fill. Keep in sync with `--wib-ground`.
 */
export const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#f4f1fa',
  dark: '#0e0c14',
};

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

/** Reflect a theme onto `<html>` (class + color-scheme + status-bar colour). */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  const el = document.documentElement;
  el.classList.toggle('dark', resolved === 'dark');
  el.style.colorScheme = resolved;
  syncThemeColorMeta(resolved);
}

/**
 * Point `<meta name="theme-color">` at the resolved theme. Next emits
 * `prefers-color-scheme`-scoped tags, which go stale the moment the in-app
 * toggle disagrees with the OS (the classic "notch stays light in dark mode").
 * We drop those and keep a single unscoped tag that always matches.
 */
function syncThemeColorMeta(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const head = document.head;
  let own: HTMLMetaElement | null = null;
  head.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
    const meta = node as HTMLMetaElement;
    if (meta.hasAttribute('media')) meta.remove();
    else own = meta;
  });
  if (!own) {
    own = document.createElement('meta');
    own.setAttribute('name', 'theme-color');
    head.appendChild(own);
  }
  own.setAttribute('content', THEME_COLORS[resolved]);
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
)};var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";var c=${JSON.stringify(
  THEME_COLORS,
)};var h=document.head,o=null,m=h.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){if(m[i].hasAttribute("media"))m[i].remove();else o=m[i];}if(!o){o=document.createElement("meta");o.setAttribute("name","theme-color");h.appendChild(o);}o.setAttribute("content",d?c.dark:c.light);}catch(_){}})();`;
