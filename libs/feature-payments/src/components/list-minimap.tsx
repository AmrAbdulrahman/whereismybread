'use client';

import { cn } from '@wib/ui';

/** Every `YYYY-MM` from `fromKey` to `toKey`, inclusive. */
function monthRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let y = Number(fromKey.slice(0, 4));
  let m = Number(fromKey.slice(5, 7));
  const ty = Number(toKey.slice(0, 4));
  const tm = Number(toKey.slice(5, 7));
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthName = (key: string) =>
  fmt.format(new Date(`${key}-01T00:00:00Z`));

/**
 * A timeline rail down the right edge of the list: a long dash + year label at
 * each January, a short dash for every month between. The month in view is
 * highlighted; hovering a dash shows its name. Tap to jump there (loading it
 * first if needed); tap "Today" to come back.
 */
export function ListMinimap({
  fromKey,
  toKey,
  loaded,
  activeKey,
  todayKey,
  stickyTop,
  onJump,
  onToday,
}: {
  fromKey: string;
  toKey: string;
  loaded: Set<string>;
  activeKey: string;
  todayKey: string;
  stickyTop: number;
  onJump: (key: string) => void;
  onToday: () => void;
}) {
  const months = monthRange(fromKey, toKey);
  if (months.length < 3) return null;

  return (
    <nav
      aria-label="Timeline"
      className="fixed right-0 z-20 flex w-14 flex-col items-stretch"
      style={{ top: stickyTop + 10, bottom: 18 }}
    >
      <button
        type="button"
        onClick={onToday}
        className="mb-1.5 shrink-0 rounded-md border border-line-strong bg-ground py-1 text-[9px] font-semibold uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
      >
        Today
      </button>
      <div className="flex min-h-0 flex-1 flex-col justify-between">
        {months.map((key, i) => {
          const yearStart = i === 0 || key.endsWith('-01');
          const active = key === activeKey;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onJump(key)}
              aria-label={monthName(key)}
              aria-current={active ? 'true' : undefined}
              className="group relative flex min-h-[6px] flex-1 items-center justify-end gap-1"
            >
              {/* hover / focus label */}
              <span className="pointer-events-none absolute right-full z-10 mr-1 hidden whitespace-nowrap rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-ink shadow-sm group-hover:block group-focus-visible:block">
                {monthName(key)}
              </span>

              {yearStart ? (
                <span className="pointer-events-none w-5 text-right text-[9px] font-semibold leading-none text-muted">
                  &lsquo;{key.slice(2, 4)}
                </span>
              ) : null}
              <span
                className={cn(
                  'block rounded-full transition-all',
                  yearStart ? 'h-[3px]' : 'h-[2px]',
                  active
                    ? 'w-8 bg-accent'
                    : isToday
                      ? 'w-6 bg-accent/60'
                      : yearStart
                        ? 'w-7 bg-line-strong'
                        : 'w-3 bg-line-strong/70',
                  'group-hover:w-8 group-hover:bg-accent',
                  !loaded.has(key) && !active && 'opacity-40',
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
