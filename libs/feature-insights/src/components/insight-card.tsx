import Link from 'next/link';
import { cn } from '@wib/ui';
import type { LucideIcon } from '@wib/ui/icons';
import type { InsightsItem } from '../lib/insights-compute';

type Tone = 'neutral' | 'good' | 'warn' | 'danger';

const TONE: Record<Tone, { icon: string; ring: string }> = {
  neutral: { icon: 'text-ink-soft', ring: 'border-line' },
  good: { icon: 'text-teal', ring: 'border-line' },
  warn: { icon: 'text-warn', ring: 'border-warn/40' },
  danger: { icon: 'text-danger', ring: 'border-danger/40' },
};

export function InsightCard({
  icon: Icon,
  title,
  tone = 'neutral',
  summary,
  items,
  viewAllHref,
  onOpenPayment,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: Tone;
  /** One-line headline under the title (e.g. "3 charges ≥ £30"). */
  summary: string;
  items?: InsightsItem[];
  viewAllHref?: string;
  /** When set, a payment-occurrence row opens the edit modal in place instead
   * of linking to `/plan`. */
  onOpenPayment?: (paymentId: string, occurrenceDate?: string) => void;
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  const list = items ?? [];

  const rowClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2/60';
  const rowInner = (it: InsightsItem) => (
    <>
      <span className="min-w-0 flex-1 truncate text-ink">{it.name}</span>
      {it.dateLabel ? (
        <span className="shrink-0 text-[11px] text-muted">{it.dateLabel}</span>
      ) : null}
      <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
        {it.amountLabel}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-xl border bg-surface p-4',
        t.ring,
      )}
    >
      <div className="flex items-start gap-2.5 pr-6">
        <Icon
          size={18}
          strokeWidth={2}
          className={cn('mt-0.5 shrink-0', t.icon)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-[13px] text-ink-soft">{summary}</p>
        </div>
      </div>

      {children}

      {list.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line/60 overflow-hidden rounded-lg border border-line/60">
          {list.slice(0, 5).map((it) => (
            <li key={it.key}>
              {onOpenPayment && it.paymentId ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenPayment(it.paymentId as string, it.occurrenceDate)
                  }
                  className={rowClass}
                >
                  {rowInner(it)}
                </button>
              ) : (
                <Link href={it.href} draggable={false} className={rowClass}>
                  {rowInner(it)}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {viewAllHref && list.length > 5 ? (
        <Link
          href={viewAllHref}
          draggable={false}
          className="self-start text-xs font-medium text-accent hover:underline"
        >
          View all {list.length} →
        </Link>
      ) : null}
    </div>
  );
}
