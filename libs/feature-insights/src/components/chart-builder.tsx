'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Label, ResponsiveModal, cn } from '@wib/ui';
import type { ChartDisplay, ChartGroupBy, DashboardChartConfig } from '@wib/db';
import {
  addChartAction,
  previewChartAction,
  saveChartAction,
  type ChartPreview,
} from '../lib/dashboard-actions';
import {
  displaysFor,
  legacyChartConfig,
  moneyLabel,
  type ChartSeries,
  type SpendFilterConfig,
} from '../lib/dashboard-compute';
import type { DashboardData } from '../lib/dashboard';
import { SpendFilterFields } from './spend-filter-fields';
import { SeriesBarChart } from './series-bar-chart';
import { SeriesPieChart } from './series-pie-chart';

const GROUP_BYS: { value: ChartGroupBy; label: string }[] = [
  { value: 'account', label: 'Account' },
  { value: 'tag', label: 'Tag' },
  { value: 'method', label: 'Payment method' },
  { value: 'bank', label: 'Bank' },
  { value: 'source', label: 'Planned vs expense' },
  { value: 'budgeted', label: 'Budgeted vs not' },
  { value: 'day', label: 'Day of month' },
  { value: 'weekday', label: 'Day of week' },
];

const DISPLAY_LABEL: Record<ChartDisplay, string> = { bar: 'Bars', pie: 'Pie' };
const LIMITS = [0, 5, 8, 12];

function defaultTitle(groupBy: ChartGroupBy, count: boolean): string {
  const g = GROUP_BYS.find((x) => x.value === groupBy)?.label ?? 'group';
  return `${count ? 'Count' : 'Spend'} by ${g.toLowerCase()}`;
}

export function ChartBuilder({
  open,
  onOpenChange,
  data,
  chart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DashboardData;
  /** Present = editing an existing chart. */
  chart?: ChartSeries;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  const seed: DashboardChartConfig = useMemo(() => {
    if (!chart) return {};
    return chart.config.groupBy
      ? chart.config
      : legacyChartConfig(chart.kind, chart.config);
  }, [chart]);

  const [title, setTitle] = useState(chart?.title ?? '');
  const [groupBy, setGroupBy] = useState<ChartGroupBy>(
    seed.groupBy ?? 'account',
  );
  const [count, setCount] = useState(seed.measure === 'count');
  const [display, setDisplay] = useState<ChartDisplay>(seed.display ?? 'bar');
  const [limit, setLimit] = useState<number>(seed.limit ?? 0);
  const [filter, setFilter] = useState<SpendFilterConfig>(seed.filter ?? {});
  const [preview, setPreview] = useState<ChartPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const allowed = displaysFor(groupBy);
  const effDisplay: ChartDisplay = allowed.includes(display)
    ? display
    : (allowed[0] ?? 'bar');
  const isTime = groupBy === 'day' || groupBy === 'weekday';

  useEffect(() => {
    setPreview(null);
    setPreviewError(false);
  }, [groupBy, count, display, limit, filter]);

  const buildConfig = (): DashboardChartConfig => ({
    ...(chart?.config.span ? { span: chart.config.span } : {}),
    groupBy,
    measure: count ? 'count' : 'sum',
    display: effDisplay,
    ...(limit > 0 && !isTime ? { limit } : {}),
    ...(Object.keys(filter).length ? { filter } : {}),
  });

  const test = () =>
    startTest(async () => {
      const res = await previewChartAction(data.month, buildConfig());
      if (res.ok) {
        setPreview(res.series);
        setPreviewError(false);
      } else {
        setPreview(null);
        setPreviewError(true);
      }
    });

  const save = () => {
    const config = buildConfig();
    const name = title.trim() || defaultTitle(groupBy, count);
    start(async () => {
      if (chart) await saveChartAction(chart.id, { title: name, config });
      else await addChartAction({ title: name, config });
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={chart ? 'Edit chart' : 'New chart'}
      description="Group this month's payments and chart the totals. It follows the month picker and source toggle at the top."
      className="lg:w-[min(40rem,calc(100vw-2rem))]"
    >
      <div className="flex flex-col gap-4">
        <Field>
          <Label htmlFor="chart-title">Title</Label>
          <Input
            id="chart-title"
            placeholder={defaultTitle(groupBy, count)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Group by
          </span>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_BYS.map((g) => (
              <button
                key={g.value}
                type="button"
                aria-pressed={groupBy === g.value}
                onClick={() => setGroupBy(g.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  groupBy === g.value
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-ink-soft hover:text-ink',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Measure
            </span>
            <div className="flex rounded-lg border border-line p-0.5">
              {[
                ['Spend total', false],
                ['Count', true],
              ].map(([lbl, v]) => (
                <button
                  key={lbl as string}
                  type="button"
                  onClick={() => setCount(v as boolean)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-xs font-medium',
                    count === v
                      ? 'bg-surface-2 text-ink'
                      : 'text-muted hover:text-ink-soft',
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Display
            </span>
            <div className="flex rounded-lg border border-line p-0.5">
              {(['bar', 'pie'] as ChartDisplay[]).map((d) => {
                const on = effDisplay === d;
                const disabled = !allowed.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDisplay(d)}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1 text-xs font-medium',
                      on
                        ? 'bg-surface-2 text-ink'
                        : disabled
                          ? 'text-muted/40'
                          : 'text-muted hover:text-ink-soft',
                    )}
                  >
                    {DISPLAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!isTime ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Show
            </span>
            {LIMITS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  limit === n
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-ink-soft hover:text-ink',
                )}
              >
                {n === 0 ? 'All' : `Top ${n}`}
              </button>
            ))}
          </div>
        ) : null}

        <div className="h-px bg-line" />

        <SpendFilterFields
          value={filter}
          onChange={setFilter}
          currency={data.currency}
          accounts={data.accounts}
          tags={data.tags}
          methods={data.methods}
          banks={data.banks}
        />

        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/40 p-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={test}
              disabled={testing || pending}
              className="shrink-0"
            >
              {testing ? 'Running…' : 'Test query'}
            </Button>
            {previewError ? (
              <span className="text-xs text-danger">
                Couldn’t run that — try again.
              </span>
            ) : !preview ? (
              <span className="text-xs text-muted">
                Preview the chart before saving.
              </span>
            ) : (
              <span className="text-xs text-ink-soft">
                {preview.points.length}{' '}
                {preview.points.length === 1 ? 'group' : 'groups'} ·{' '}
                {preview.isMoney
                  ? moneyLabel(preview.totalMinor, data.currency)
                  : `${preview.totalMinor} items`}
              </span>
            )}
          </div>
          {preview && !preview.empty ? (
            <div className="min-w-0 overflow-hidden rounded-md bg-surface p-2">
              {effDisplay === 'pie' ? (
                <SeriesPieChart
                  points={preview.points}
                  currency={data.currency}
                  isMoney={preview.isMoney}
                />
              ) : (
                <SeriesBarChart
                  points={preview.points}
                  currency={data.currency}
                  isMoney={preview.isMoney}
                  categorical={preview.categorical}
                />
              )}
            </div>
          ) : null}
          {preview?.empty ? (
            <span className="text-xs text-muted">
              Nothing matches for {data.month}.
            </span>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : chart ? 'Save' : 'Add chart'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
