'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Label, ResponsiveModal, cn } from '@wib/ui';
import type { DashboardChartConfig } from '@wib/db';
import { saveChartAction } from '../lib/dashboard-actions';
import type { ChartSeries } from '../lib/dashboard-compute';
import type { DashboardOption } from '../lib/dashboard';

export function ChartSettings({
  chart,
  accounts,
  tags,
  open,
  onOpenChange,
}: {
  chart: ChartSeries;
  accounts: DashboardOption[];
  tags: DashboardOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(chart.title);
  const [excluded, setExcluded] = useState<string[]>(
    chart.config.excludeAccountIds ?? [],
  );
  // `null` = all tags; an array = an explicit allow-list.
  const [included, setIncluded] = useState<string[] | null>(
    chart.config.includeTagIds ?? null,
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const save = () => {
    // Keep the card span — it lives in the same config blob.
    const config: DashboardChartConfig = chart.config.span
      ? { span: chart.config.span }
      : {};
    if (chart.kind === 'account_pie') config.excludeAccountIds = excluded;
    if (chart.kind === 'tag_pie' && included !== null) {
      config.includeTagIds = included;
    }
    start(async () => {
      await saveChartAction(chart.id, { title, config });
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Chart settings"
    >
      <div className="flex flex-col gap-4">
        <Field>
          <Label htmlFor="chart-title">Title</Label>
          <Input
            id="chart-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        {chart.kind === 'account_pie' ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-ink">Accounts to show</p>
            <p className="text-xs text-ink-soft">
              Untick an account to leave it out of this chart.
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {accounts.map((a) => {
                const on = !excluded.includes(a.id);
                return (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setExcluded((prev) => toggle(prev, a.id))
                        }
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: a.color }}
                      />
                      <span className="text-ink">{a.name}</span>
                    </label>
                  </li>
                );
              })}
              {accounts.length === 0 ? (
                <li className="px-1.5 text-xs text-muted">No accounts yet.</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {chart.kind === 'tag_pie' ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-ink">Tags to include</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={included === null}
                onChange={(e) => setIncluded(e.target.checked ? null : [])}
              />
              <span className="text-ink">All tags</span>
            </label>
            {included !== null ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = included.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setIncluded((prev) => toggle(prev ?? [], t.id))
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs',
                        on
                          ? 'border-accent bg-accent/10 text-ink'
                          : 'border-line text-ink-soft',
                      )}
                    >
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: t.color }}
                      />
                      {t.name}
                    </button>
                  );
                })}
                {tags.length === 0 ? (
                  <span className="text-xs text-muted">No tags yet.</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {chart.kind === 'month_spend_line' ? (
          <p className="text-xs text-ink-soft">
            This chart follows the month picker at the top of the dashboard.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
