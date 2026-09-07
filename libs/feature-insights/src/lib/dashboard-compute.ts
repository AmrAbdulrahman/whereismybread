import { formatMoney, money } from '@wib/domain';
import type { DashboardChartConfig, DashboardChartKind } from '@wib/db';

/** Slice colour for the "no account" / "untagged" bucket. */
const NEUTRAL = '#94a3b8';

/** Where a spend figure comes from. */
export type SpendSource = 'planned' | 'expense';

/**
 * One unit of spend the dashboard charts over — a recorded expense or a planned
 * payment occurrence, already flattened and converted to the display currency.
 */
export interface SpendItem {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Amount in display-currency minor units. */
  minor: number;
  accountId: string | null;
  accountName: string | null;
  accountColor: string | null;
  tags: { id: string; name: string; color: string }[];
  source: SpendSource;
  /** Expense tied to a budget (planned items are never budgeted). */
  budgeted: boolean;
}

/** `YYYY-MM` for a `YYYY-MM-DD` date (or a longer ISO string). */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Days in the given `YYYY-MM`. */
export function daysIn(month: string): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Items dated in `month` (`YYYY-MM`). */
export function itemsInMonth(items: SpendItem[], month: string): SpendItem[] {
  return items.filter((it) => monthKey(it.date) === month);
}

// --- series types -------------------------------------------------------

export interface BarPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Day of month, 1-based. */
  day: number;
  /** That day's spend, minor units. */
  minor: number;
}

export interface Slice {
  key: string;
  label: string;
  valueMinor: number;
  /** The account/tag's own colour, or `null` to fall back to the palette. */
  color: string | null;
}

export interface ChartSeries {
  id: string;
  kind: DashboardChartKind;
  title: string;
  config: DashboardChartConfig;
  currency: string;
  /** Sum the chart represents, minor units. */
  totalMinor: number;
  empty: boolean;
  bars?: BarPoint[];
  slices?: Slice[];
}

// --- per-day spend bars ------------------------------------------------

export function spendBars(items: SpendItem[], month: string): BarPoint[] {
  const n = daysIn(month);
  const perDay = new Array<number>(n + 1).fill(0);
  for (const it of itemsInMonth(items, month)) {
    const day = Number(it.date.slice(8, 10));
    if (day >= 1 && day <= n) perDay[day] = (perDay[day] ?? 0) + it.minor;
  }
  const out: BarPoint[] = [];
  for (let day = 1; day <= n; day++) {
    out.push({
      date: `${month}-${String(day).padStart(2, '0')}`,
      day,
      minor: perDay[day] ?? 0,
    });
  }
  return out;
}

// --- grouping --------------------------------------------------------

interface Bucket {
  label: string;
  color: string | null;
  minor: number;
}

function bumpBucket(
  acc: Map<string, Bucket>,
  key: string,
  label: string,
  color: string | null,
  minor: number,
): void {
  const cur = acc.get(key);
  if (cur) cur.minor += minor;
  else acc.set(key, { label, color, minor });
}

function toSlices(acc: Map<string, Bucket>): Slice[] {
  return [...acc.entries()]
    .filter(([, v]) => v.minor > 0)
    .sort((a, b) => b[1].minor - a[1].minor)
    .map(([key, v]) => ({
      key,
      label: v.label,
      valueMinor: v.minor,
      color: v.color,
    }));
}

export function accountPie(
  items: SpendItem[],
  month: string,
  excludeAccountIds: string[] = [],
): Slice[] {
  const excluded = new Set(excludeAccountIds);
  const acc = new Map<string, Bucket>();
  for (const it of itemsInMonth(items, month)) {
    const id = it.accountId ?? '__none__';
    if (excluded.has(id)) continue;
    bumpBucket(
      acc,
      id,
      it.accountName ?? 'No account',
      it.accountId ? (it.accountColor ?? null) : NEUTRAL,
      it.minor,
    );
  }
  return toSlices(acc);
}

export function tagPie(
  items: SpendItem[],
  month: string,
  includeTagIds?: string[],
): Slice[] {
  const include = includeTagIds ? new Set(includeTagIds) : null;
  const acc = new Map<string, Bucket>();
  for (const it of itemsInMonth(items, month)) {
    const tags = include ? it.tags.filter((t) => include.has(t.id)) : it.tags;
    if (tags.length === 0) {
      if (!include) bumpBucket(acc, '__untagged__', 'Untagged', NEUTRAL, it.minor);
      continue;
    }
    // Split evenly so the slices still sum to the spend total.
    const share = Math.round(it.minor / tags.length);
    tags.forEach((t, i) => {
      const v =
        i === tags.length - 1 ? it.minor - share * (tags.length - 1) : share;
      bumpBucket(acc, t.id, t.name, t.color || null, v);
    });
  }
  return toSlices(acc);
}

// --- stat strip -----------------------------------------------------

export interface StatStripData {
  month: string;
  currency: string;
  /** Total of the currently-selected sources. */
  totalMinor: number;
  recordedMinor: number;
  recordedCount: number;
  plannedMinor: number;
  plannedCount: number;
}

/**
 * `all` is every item for the month regardless of the source filter — so the
 * strip can always show the recorded / planned breakdown; `sources` decides
 * which of them the headline total adds up.
 */
export function statStrip(
  all: SpendItem[],
  month: string,
  currency: string,
  sources: Set<SpendSource>,
): StatStripData {
  let recordedMinor = 0;
  let recordedCount = 0;
  let plannedMinor = 0;
  let plannedCount = 0;
  for (const it of itemsInMonth(all, month)) {
    if (it.source === 'expense') {
      recordedMinor += it.minor;
      recordedCount += 1;
    } else {
      plannedMinor += it.minor;
      plannedCount += 1;
    }
  }
  const totalMinor =
    (sources.has('expense') ? recordedMinor : 0) +
    (sources.has('planned') ? plannedMinor : 0);
  return {
    month,
    currency: currency.toUpperCase(),
    totalMinor,
    recordedMinor,
    recordedCount,
    plannedMinor,
    plannedCount,
  };
}

// --- dispatch -------------------------------------------------------

export interface ChartInput {
  id: string;
  kind: DashboardChartKind;
  title: string;
  config: DashboardChartConfig;
}

/** Build the renderable series for one chart card from the selected items. */
export function buildSeries(
  chart: ChartInput,
  items: SpendItem[],
  month: string,
  currency: string,
): ChartSeries {
  const base = {
    id: chart.id,
    kind: chart.kind,
    title: chart.title,
    config: chart.config,
    currency: currency.toUpperCase(),
  };

  if (chart.kind === 'month_spend_line') {
    const bars = spendBars(items, month);
    const totalMinor = bars.reduce((s, b) => s + b.minor, 0);
    return { ...base, bars, totalMinor, empty: totalMinor === 0 };
  }

  const slices =
    chart.kind === 'tag_pie'
      ? tagPie(items, month, chart.config.includeTagIds)
      : accountPie(items, month, chart.config.excludeAccountIds ?? []);
  const totalMinor = slices.reduce((s, x) => s + x.valueMinor, 0);
  return { ...base, slices, totalMinor, empty: slices.length === 0 };
}

/** A short money label in the display currency (for axes / tooltips). */
export function moneyLabel(minor: number, currency: string): string {
  return formatMoney(money(Math.round(minor), currency));
}

/** Clamp a stored card span to something the grid can show. */
export function clampSpan(span: number | undefined): number {
  if (!span || !Number.isFinite(span)) return 1;
  return Math.min(2, Math.max(1, Math.round(span)));
}
