'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, money, toMajor } from '@wib/domain';
import type { BarPoint } from '../lib/dashboard-compute';

function compact(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${currency === 'GBP' ? '£' : ''}${(value / 1000).toFixed(1)}k`;
  }
  return formatMoney(money(Math.round(value), currency));
}

export function SpendBarChart({
  points,
  currency,
}: {
  points: BarPoint[];
  currency: string;
}) {
  const data = points.map((p) => ({
    day: p.day,
    value: toMajor(money(p.minor, currency)),
    minor: p.minor,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          stroke="var(--color-line)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-line)' }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          width={48}
          tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => compact(v, currency)}
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
          labelFormatter={(d) => `Day ${d}`}
          formatter={(_value, _name, item) => [
            formatMoney(money(Number(item?.payload?.minor ?? 0), currency)),
            'Spent',
          ]}
        />
        <Bar
          dataKey="value"
          fill="var(--color-accent)"
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
