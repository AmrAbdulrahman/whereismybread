'use client';

import { useState } from 'react';
import { Plus } from '@wib/ui/icons';
import type { DashboardData } from '../lib/dashboard';
import { ChartBuilder } from './chart-builder';

export function AddChartMenu({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[8rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-sm font-medium text-ink-soft hover:border-accent hover:text-ink"
      >
        <Plus size={16} />
        Add chart
      </button>

      {open ? (
        <ChartBuilder open={open} onOpenChange={setOpen} data={data} />
      ) : null}
    </>
  );
}
