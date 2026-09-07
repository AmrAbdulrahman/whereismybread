'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner, cn } from '@wib/ui';
import { ChevronLeft, ChevronRight, Plus } from '@wib/ui/icons';
import { moneyLabel, type SpendSource } from '../lib/dashboard-compute';
import type { DashboardData } from '../lib/dashboard';
import { reorderChartsAction } from '../lib/dashboard-actions';
import { AddChartMenu } from './add-chart-menu';
import { ChartCard } from './chart-card';
import { StatBuilder } from './stat-builder';
import { StatValueCard } from './stat-value-card';

function monthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const SOURCE_LABEL: Record<SpendSource, string> = {
  planned: 'Planned',
  expense: 'Expenses',
};

/** Local order state that re-syncs whenever the server's id set changes. */
function useOrdered<T extends { id: string }>(rows: T[]): {
  ordered: T[];
  setOrder: (ids: string[]) => void;
} {
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const [order, setOrder] = useState<string[]>(ids);
  useEffect(() => {
    setOrder((prev) => {
      const same =
        prev.length === ids.length && prev.every((id) => ids.includes(id));
      return same ? prev : ids;
    });
  }, [ids]);

  const ordered = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out = order
      .map((id) => byId.get(id))
      .filter((r): r is T => r != null);
    for (const r of rows) if (!order.includes(r.id)) out.push(r);
    return out;
  }, [rows, order]);

  return { ordered, setOrder };
}

export function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [, startReorder] = useTransition();
  const [addingStat, setAddingStat] = useState(false);

  const { ordered: stats, setOrder: setStatOrder } = useOrdered(data.stats);
  const { ordered: charts, setOrder: setChartOrder } = useOrdered(data.charts);

  const hrefFor = (month: string, sources: SpendSource[]) => {
    const params = new URLSearchParams();
    params.set('m', month);
    if (sources.length === 1) params.set('src', sources[0] as string);
    return `/insights?${params.toString()}`;
  };

  const goToMonth = (month: string) =>
    startNav(() =>
      router.push(hrefFor(month, data.sources), { scroll: false }),
    );

  const toggleSource = (s: SpendSource) => {
    const has = data.sources.includes(s);
    const next: SpendSource[] = has
      ? data.sources.filter((x) => x !== s)
      : [...data.sources, s];
    if (next.length === 0) return;
    startNav(() =>
      router.push(hrefFor(data.month, next), { scroll: false }),
    );
  };

  const persist = (statIds: string[], chartIds: string[]) =>
    startReorder(async () => {
      await reorderChartsAction([...statIds, ...chartIds]);
      router.refresh();
    });

  const reorder =
    (
      current: { id: string }[],
      setLocal: (ids: string[]) => void,
      isStats: boolean,
    ) =>
    (draggedId: string, targetId: string) => {
      const next = current.map((c) => c.id);
      const from = next.indexOf(draggedId);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return;
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      setLocal(next);
      persist(
        isStats ? next : stats.map((s) => s.id),
        isStats ? charts.map((c) => c.id) : next,
      );
    };

  const moveStat = reorder(stats, setStatOrder, true);
  const moveChart = reorder(charts, setChartOrder, false);

  const { stat } = data;
  const on = (s: SpendSource) => data.sources.includes(s);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-ink">Stats</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => goToMonth(data.prevMonth)}
            className="rounded-md p-1.5 text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <ChevronLeft size={16} />
          </button>
          <span
            className={cn(
              'min-w-[8.5rem] text-center text-sm font-medium text-ink',
              navPending && 'opacity-50',
            )}
          >
            {monthLabel(data.month)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => goToMonth(data.nextMonth)}
            className="rounded-md p-1.5 text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <ChevronRight size={16} />
          </button>
          {navPending ? <Spinner className="ml-1 size-4" /> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Include
        </span>
        {(['planned', 'expense'] as SpendSource[]).map((s) => {
          const active = on(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSource(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line text-muted hover:text-ink-soft',
              )}
            >
              {SOURCE_LABEL[s]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="This month"
          value={moneyLabel(stat.totalMinor, stat.currency)}
          sub={data.sources.map((s) => SOURCE_LABEL[s].toLowerCase()).join(' + ')}
        />
        <StatTile
          label="Expenses"
          value={moneyLabel(stat.recordedMinor, stat.currency)}
          sub={`${stat.recordedCount} recorded`}
          muted={!on('expense')}
        />
        <StatTile
          label="Planned"
          value={moneyLabel(stat.plannedMinor, stat.currency)}
          sub={`${stat.plannedCount} ${stat.plannedCount === 1 ? 'payment' : 'payments'}`}
          muted={!on('planned')}
        />
        {stats.map((s) => (
          <StatValueCard
            key={s.id}
            stat={s}
            data={data}
            onDropBefore={moveStat}
          />
        ))}
        <button
          type="button"
          onClick={() => setAddingStat(true)}
          className="flex min-h-[4.5rem] items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-xs font-medium text-ink-soft hover:border-accent hover:text-ink"
        >
          <Plus size={14} />
          Add stat
        </button>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {charts.map((c) => (
          <ChartCard
            key={c.id}
            chart={c}
            data={data}
            onDropBefore={moveChart}
          />
        ))}
        <AddChartMenu data={data} />
      </div>

      {addingStat ? (
        <StatBuilder
          open={addingStat}
          onOpenChange={setAddingStat}
          data={data}
        />
      ) : null}
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  muted = false,
}: {
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-3',
        muted && 'opacity-45',
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="font-display text-lg font-semibold tabular-nums text-ink">
        {value}
      </span>
      <span className="text-[11px] text-ink-soft">{sub}</span>
    </div>
  );
}
