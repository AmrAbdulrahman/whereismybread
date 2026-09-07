'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveModal } from '@wib/ui';
import { ChartColumnBig, ChartPie, Plus } from '@wib/ui/icons';
import type { DashboardChartKind } from '@wib/db';
import { addChartAction } from '../lib/dashboard-actions';

const TEMPLATES: {
  kind: DashboardChartKind;
  label: string;
  hint: string;
  icon: typeof ChartPie;
}[] = [
  {
    kind: 'month_spend_line',
    label: 'Spending over the month',
    hint: 'A bar for each day of the month.',
    icon: ChartColumnBig,
  },
  {
    kind: 'account_pie',
    label: 'Split by account',
    hint: 'Where the month’s spending went, account by account.',
    icon: ChartPie,
  },
  {
    kind: 'tag_pie',
    label: 'Split by tag',
    hint: 'The month’s spending grouped by the tags you use.',
    icon: ChartPie,
  },
];

export function AddChartMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const add = (kind: DashboardChartKind) =>
    start(async () => {
      await addChartAction(kind);
      router.refresh();
      setOpen(false);
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm font-medium text-ink-soft hover:border-accent hover:text-ink"
      >
        <Plus size={15} />
        Add chart
      </button>

      <ResponsiveModal open={open} onOpenChange={setOpen} title="Add a chart">
        <ul className="flex flex-col gap-2">
          {TEMPLATES.map((t) => (
            <li key={t.kind}>
              <button
                type="button"
                disabled={pending}
                onClick={() => add(t.kind)}
                className="flex w-full items-start gap-3 rounded-lg border border-line p-3 text-left hover:border-accent disabled:opacity-60"
              >
                <t.icon
                  size={18}
                  className="mt-0.5 shrink-0 text-accent"
                  strokeWidth={2}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">
                    {t.label}
                  </span>
                  <span className="block text-xs text-ink-soft">{t.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ResponsiveModal>
    </>
  );
}
