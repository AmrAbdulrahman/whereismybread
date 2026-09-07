'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, useMediaQuery } from '@wib/ui';
import { GripVertical, SlidersHorizontal, Trash2 } from '@wib/ui/icons';
import { deleteChartAction, saveChartAction } from '../lib/dashboard-actions';
import {
  clampSpan,
  moneyLabel,
  type ChartSeries,
} from '../lib/dashboard-compute';
import type { DashboardData } from '../lib/dashboard';
import { ChartBuilder } from './chart-builder';
import { SeriesBarChart } from './series-bar-chart';
import { SeriesPieChart } from './series-pie-chart';

export function ChartCard({
  chart,
  data,
  onDropBefore,
}: {
  chart: ChartSeries;
  data: DashboardData;
  onDropBefore: (draggedId: string, targetId: string) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [span, setSpan] = useState(() => clampSpan(chart.config.span));
  // The chart grid is 1 column below `lg`; a `span 2` there spawns an implicit
  // second column and the chart stops being full width on mobile.
  const wide = useMediaQuery('(min-width: 1024px)');

  const persistSpan = (next: number) =>
    start(async () => {
      await saveChartAction(chart.id, {
        config: { ...chart.config, span: next },
      });
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      await deleteChartAction(chart.id);
      router.refresh();
    });

  // Drag the right edge; snap to whole grid columns (1 or 2).
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = ref.current?.parentElement;
    if (!grid) return;
    const styles = getComputedStyle(grid);
    const cols = styles.gridTemplateColumns.split(' ').filter(Boolean).length;
    const gap = parseFloat(styles.columnGap) || 0;
    const unit = (grid.getBoundingClientRect().width - gap * (cols - 1)) / cols;
    const startX = e.clientX;
    const startSpan = span;
    setResizing(true);

    const onMove = (ev: MouseEvent) => {
      const deltaCols = Math.round((ev.clientX - startX) / (unit + gap));
      const next = Math.min(cols, Math.max(1, startSpan + deltaCols));
      setSpan(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizing(false);
      setSpan((s) => {
        if (s !== clampSpan(chart.config.span)) persistSpan(s);
        return s;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const subtitle = chart.isMoney
    ? `${moneyLabel(chart.totalMinor, chart.currency)} this month`
    : `${chart.totalMinor} ${chart.totalMinor === 1 ? 'item' : 'items'} this month`;

  return (
    <div
      ref={ref}
      draggable={!resizing}
      style={wide && span > 1 ? { gridColumn: 'span 2' } : undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', chart.id);
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
        if (dragged && dragged !== chart.id) onDropBefore(dragged, chart.id);
      }}
      className={cn(
        'group relative flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4',
        (dragging || resizing) && 'opacity-60',
        over && 'ring-2 ring-accent ring-offset-2 ring-offset-ground',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 hidden cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block">
          <GripVertical size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {chart.title}
          </p>
          <p className="text-[13px] text-ink-soft">{subtitle}</p>
        </div>
        <button
          type="button"
          aria-label="Edit chart"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <SlidersHorizontal size={15} />
        </button>
        <button
          type="button"
          aria-label="Delete chart"
          onClick={remove}
          disabled={pending}
          className="shrink-0 rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {chart.empty ? (
        <p className="rounded-lg border border-dashed border-line py-8 text-center text-sm text-muted">
          Nothing for this month.
        </p>
      ) : chart.display === 'pie' ? (
        <SeriesPieChart
          points={chart.points}
          currency={chart.currency}
          isMoney={chart.isMoney}
        />
      ) : (
        <SeriesBarChart
          points={chart.points}
          currency={chart.currency}
          isMoney={chart.isMoney}
          categorical={chart.categorical}
        />
      )}

      <span
        role="separator"
        aria-label="Resize card"
        draggable={false}
        onMouseDown={startResize}
        className="absolute -right-1.5 top-1/2 z-10 hidden h-10 w-3 -translate-y-1/2 cursor-col-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 lg:flex"
      >
        <span className="h-8 w-1 rounded-full bg-line-strong" />
      </span>

      {editing ? (
        <ChartBuilder
          open={editing}
          onOpenChange={setEditing}
          data={data}
          chart={chart}
        />
      ) : null}
    </div>
  );
}
