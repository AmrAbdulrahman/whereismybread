'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { COLOR_PALETTE } from '@wib/ui';
import { formatMoney, money, toMajor } from '@wib/domain';
import type { SeriesPoint } from '../lib/dashboard-compute';

function compact(value: number, currency: string, isMoney: boolean): string {
  if (!isMoney) return String(Math.round(value));
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${currency === 'GBP' ? '£' : ''}${(value / 1000).toFixed(1)}k`;
  }
  return formatMoney(money(Math.round(value), currency));
}

export function SeriesBarChart({
  points,
  currency,
  isMoney,
  categorical,
}: {
  points: SeriesPoint[];
  currency: string;
  isMoney: boolean;
  categorical: boolean;
}) {
  const data = points.map((p, i) => ({
    label: p.label,
    plot: isMoney ? toMajor(money(p.value, currency)) : p.value,
    raw: p.value,
    fill:
      p.color ??
      (categorical
        ? (COLOR_PALETTE[i % COLOR_PALETTE.length] ?? 'var(--color-accent)')
        : 'var(--color-accent)'),
  }));
  const dense = data.length > 12;

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, bottom: categorical ? 24 : 0, left: 0 }}
      >
        <CartesianGrid
          stroke="var(--color-line)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-line)' }}
          interval={dense ? 'preserveStartEnd' : 0}
          minTickGap={dense ? 12 : 4}
          angle={categorical && !dense ? -28 : 0}
          textAnchor={categorical && !dense ? 'end' : 'middle'}
          height={categorical && !dense ? 44 : 20}
        />
        <YAxis
          width={48}
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={isMoney}
          tickFormatter={(v: number) => compact(v, currency, isMoney)}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-surface-2)' }}
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            borderRadius: 10,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--color-ink-soft)' }}
          formatter={(_value, _name, item) => [
            isMoney
              ? formatMoney(money(Number(item?.payload?.raw ?? 0), currency))
              : String(item?.payload?.raw ?? 0),
            isMoney ? 'Total' : 'Count',
          ]}
        />
        <Bar dataKey="plot" radius={[3, 3, 0, 0]} maxBarSize={36}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
