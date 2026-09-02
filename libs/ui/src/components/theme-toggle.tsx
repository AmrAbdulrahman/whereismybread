'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from '../icons';
import { cn } from '../lib/cn';
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type Theme,
} from '../lib/theme';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/** Light / Dark / System picker. Persists to localStorage, no flash on reload. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  // Keep "system" in sync with the OS setting while it's selected.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const pick = (next: Theme) => {
    setTheme(next);
    storeTheme(next);
    applyTheme(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line-strong bg-ground p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => pick(value)}
            className={cn(
              'grid h-7 w-8 place-items-center rounded-md transition-colors',
              selected
                ? 'bg-surface-2 text-ink shadow-sm'
                : 'text-muted hover:text-ink',
            )}
          >
            <Icon size={15} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
