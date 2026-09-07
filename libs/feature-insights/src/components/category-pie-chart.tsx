'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { COLOR_PALETTE } from '@wib/ui';
import { formatMoney, money } from '@wib/domain';
import type { Slice } from '../lib/dashboard-compute';

function colorFor(slice: Slice, i: number): string {
  return slice.color ?? COLOR_PALETTE[i % COLOR_PALETTE.length] ?? '#94a3b8';
}

export function CategoryPieChart({
  slices,
  currency,
}: {
  slices: Slice[];
  currency: string;
}) {
  const total = slices.reduce((s, x) => s + x.valueMinor, 0);
  const data = slices.map((s, i) => ({
    name: s.label,
    value: s.valueMinor,
    color: colorFor(s, i),
  }));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-[180px] w-full sm:w-[180px] sm:shrink-0">
        <ResponsiveContainer width="100%" height="100%">
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
              formatter={(value) =>
                formatMoney(money(Number(value ?? 0), currency))
              }
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
                {formatMoney(money(d.value, currency))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
