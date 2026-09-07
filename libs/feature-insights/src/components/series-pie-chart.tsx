'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { COLOR_PALETTE } from '@wib/ui';
import { formatMoney, money } from '@wib/domain';
import type { SeriesPoint } from '../lib/dashboard-compute';

const NEUTRAL = '#94a3b8';

export function SeriesPieChart({
  points,
  currency,
  isMoney,
}: {
  points: SeriesPoint[];
  currency: string;
  isMoney: boolean;
}) {
  const total = points.reduce((s, p) => s + p.value, 0);
  const data = points.map((p, i) => ({
    name: p.label,
    value: p.value,
    color: p.color ?? COLOR_PALETTE[i % COLOR_PALETTE.length] ?? NEUTRAL,
  }));
  const fmt = (v: number) =>
    isMoney
      ? formatMoney(money(Math.round(v), currency))
      : String(Math.round(v));

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-[180px] w-full min-w-0 sm:w-[180px] sm:shrink-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={78}
              paddingAngle={1}
              stroke="var(--color-surface)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-line)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(value) => fmt(Number(value ?? 0))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={d.name} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: d.color }}
              />
              <span className="min-w-0 flex-1 truncate text-ink">{d.name}</span>
              <span className="shrink-0 text-[11px] text-muted">{pct}%</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
                {fmt(d.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
