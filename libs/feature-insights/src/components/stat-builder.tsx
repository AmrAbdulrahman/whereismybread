'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Label, ResponsiveModal, cn } from '@wib/ui';
import type { DashboardChartConfig, StatMeasure } from '@wib/db';
import {
  addStatAction,
  previewStatAction,
  saveChartAction,
} from '../lib/dashboard-actions';
import {
  moneyLabel,
  type SpendFilterConfig,
  type StatResult,
} from '../lib/dashboard-compute';
import type { DashboardData, StatCardData } from '../lib/dashboard';
import { SpendFilterFields } from './spend-filter-fields';

const MEASURES: { value: StatMeasure; label: string; hint: string }[] = [
  { value: 'sum', label: 'Total', hint: 'Add the amounts up' },
  { value: 'count', label: 'Count', hint: 'How many' },
  { value: 'avg', label: 'Average', hint: 'Mean amount' },
  { value: 'min', label: 'Smallest', hint: 'Lowest amount' },
  { value: 'max', label: 'Largest', hint: 'Highest amount' },
];

export function StatBuilder({
  open,
  onOpenChange,
  data,
  stat,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DashboardData;
  /** Present = editing; absent = creating. */
  stat?: StatCardData;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [title, setTitle] = useState(stat?.title ?? '');
  const [measure, setMeasure] = useState<StatMeasure>(
    stat?.config.measure ?? 'sum',
  );
  const [compare, setCompare] = useState(stat?.config.compare === 'prev_month');
  const [filter, setFilter] = useState<SpendFilterConfig>(
    stat?.config.filter ?? {},
  );
  const [preview, setPreview] = useState<StatResult | null>(null);
  const [previewError, setPreviewError] = useState(false);

  // The preview goes stale the moment any input changes.
  useEffect(() => {
    setPreview(null);
    setPreviewError(false);
  }, [filter, measure, compare]);

  const buildConfig = (): DashboardChartConfig => ({
    ...(stat?.config.span ? { span: stat.config.span } : {}),
    measure,
    ...(compare ? { compare: 'prev_month' as const } : {}),
    ...(Object.keys(filter).length ? { filter } : {}),
  });

  const test = () =>
    startTest(async () => {
      const res = await previewStatAction(data.month, buildConfig());
      if (res.ok) {
        setPreview(res.result);
        setPreviewError(false);
      } else {
        setPreview(null);
        setPreviewError(true);
      }
    });

  const save = () => {
    const config = buildConfig();
    const name = title.trim() || measureName(measure);
    start(async () => {
      if (stat) await saveChartAction(stat.id, { title: name, config });
      else await addStatAction({ title: name, config });
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={stat ? 'Edit stat' : 'New stat'}
      description="Pick which payments to count and how to add them up. It follows the month picker at the top."
    >
      <div className="flex flex-col gap-4">
        <Field>
          <Label htmlFor="stat-title">Title</Label>
          <Input
            id="stat-title"
            placeholder={measureName(measure)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Measure
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MEASURES.map((m) => (
              <button
                key={m.value}
                type="button"
                title={m.hint}
                aria-pressed={measure === m.value}
                onClick={() => setMeasure(m.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  measure === m.value
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-ink-soft hover:text-ink',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
          />
          <span className="text-ink">Compare with the previous month</span>
        </label>

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

        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/40 p-3">
          <Button
            variant="ghost"
            onClick={test}
            disabled={testing || pending}
            className="shrink-0"
          >
            {testing ? 'Running…' : 'Test query'}
          </Button>
          <PreviewResult
            result={preview}
            error={previewError}
            month={data.month}
            currency={data.currency}
          />
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
            {pending ? 'Saving…' : stat ? 'Save' : 'Add stat'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

function PreviewResult({
  result,
  error,
  month,
  currency,
}: {
  result: StatResult | null;
  error: boolean;
  month: string;
  currency: string;
}) {
  if (error) {
    return <span className="text-xs text-danger">Couldn’t run that — try again.</span>;
  }
  if (!result) {
    return (
      <span className="text-xs text-muted">
        Preview the result for {monthLabel(month)} before saving.
      </span>
    );
  }
  const val = result.isMoney
    ? moneyLabel(result.value, currency)
    : String(result.value);
  const cmp = result.compare;
  return (
    <div className="flex min-w-0 flex-col">
      <span className="font-display text-base font-semibold tabular-nums text-ink">
        {val}
        <span className="ml-1.5 text-[11px] font-normal text-muted">
          {result.measureLabel.toLowerCase()} · {result.matched}{' '}
          {result.matched === 1 ? 'item' : 'items'}
        </span>
      </span>
      {cmp ? (
        <span className="text-[11px] text-ink-soft">
          {cmp.deltaValue === 0 ? '±' : cmp.deltaValue > 0 ? '▲' : '▼'}{' '}
          {result.isMoney
            ? moneyLabel(Math.abs(cmp.deltaValue), currency)
            : Math.abs(cmp.deltaValue)}
          {cmp.deltaPct != null
            ? ` · ${Math.abs(Math.round(cmp.deltaPct * 100))}%`
            : ''}{' '}
          vs last month
        </span>
      ) : null}
    </div>
  );
}

function monthLabel(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  });
}

function measureName(m: StatMeasure): string {
  return MEASURES.find((x) => x.value === m)?.label ?? 'Stat';
}
