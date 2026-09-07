'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@wib/ui';
import { GripVertical, Pencil, Trash2 } from '@wib/ui/icons';
import { deleteChartAction } from '../lib/dashboard-actions';
import { moneyLabel } from '../lib/dashboard-compute';
import type { StatCardData } from '../lib/dashboard';
import { StatBuilder } from './stat-builder';
import type { DashboardData } from '../lib/dashboard';

function fmt(value: number, isMoney: boolean, currency: string): string {
  return isMoney ? moneyLabel(value, currency) : String(value);
}

export function StatValueCard({
  stat,
  data,
  onDropBefore,
}: {
  stat: StatCardData;
  data: DashboardData;
  onDropBefore: (draggedId: string, targetId: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const { result } = stat;
  const cmp = result.compare;
  const up = cmp ? cmp.deltaValue > 0 : false;
  const flat = cmp ? cmp.deltaValue === 0 : true;

  const remove = () =>
    start(async () => {
      await deleteChartAction(stat.id);
      router.refresh();
    });

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', stat.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dragged = e.dataTransfer.getData('text/plain');
        if (dragged && dragged !== stat.id) onDropBefore(dragged, stat.id);
      }}
      className={cn(
        'group relative flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-3',
        dragging && 'opacity-60',
        over && 'ring-2 ring-accent ring-offset-2 ring-offset-ground',
      )}
    >
      <div className="flex items-center gap-1">
        <span className="hidden cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block">
          <GripVertical size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted">
          {stat.title}
        </span>
        <button
          type="button"
          aria-label="Edit stat"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          aria-label="Delete stat"
          onClick={remove}
          disabled={pending}
          className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <span className="font-display text-lg font-semibold tabular-nums text-ink">
        {fmt(result.value, result.isMoney, data.currency)}
      </span>

      <span className="text-[11px] text-ink-soft">
        {result.measureLabel} · {result.matched}{' '}
        {result.matched === 1 ? 'item' : 'items'}
      </span>

      {cmp ? (
        <span
          className={cn(
            'text-[11px] font-medium tabular-nums',
            flat ? 'text-muted' : up ? 'text-danger' : 'text-teal',
          )}
        >
          {flat ? '±' : up ? '▲' : '▼'}{' '}
          {fmt(Math.abs(cmp.deltaValue), result.isMoney, data.currency)}
          {cmp.deltaPct != null
            ? ` · ${Math.abs(Math.round(cmp.deltaPct * 100))}%`
            : ''}{' '}
          <span className="font-normal text-muted">vs last month</span>
        </span>
      ) : null}

      {editing ? (
        <StatBuilder
          open={editing}
          onOpenChange={setEditing}
          data={data}
          stat={stat}
        />
      ) : null}
    </div>
  );
}
