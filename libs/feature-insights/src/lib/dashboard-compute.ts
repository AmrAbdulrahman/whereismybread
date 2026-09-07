import { formatMoney, money } from '@wib/domain';
import type {
  ChartDisplay,
  ChartGroupBy,
  DashboardChartConfig,
  DashboardChartKind,
  SpendFilterConfig,
  StatMeasure,
} from '@wib/db';

export type { SpendFilterConfig, StatMeasure, ChartGroupBy, ChartDisplay };

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
  name: string;
  notes: string | null;
  accountId: string | null;
  accountName: string | null;
  accountColor: string | null;
  methodId: string | null;
  methodName: string | null;
  bankId: string | null;
  bankName: string | null;
  tags: { id: string; name: string; color: string }[];
  source: SpendSource;
  /** Expense tied to a budget (planned items are never budgeted). */
  budgeted: boolean;
}

// --- faceted filter --------------------------------------------------

/** True when `it` satisfies every set constraint in `filter`. */
export function matchesFilter(
  it: SpendItem,
  filter: SpendFilterConfig | undefined,
): boolean {
  if (!filter) return true;

  if (filter.source && it.source !== filter.source) return false;
  if (filter.budgeted != null && it.budgeted !== filter.budgeted) return false;
  if (filter.amountMinMinor != null && it.minor < filter.amountMinMinor) {
    return false;
  }
  if (filter.amountMaxMinor != null && it.minor > filter.amountMaxMinor) {
    return false;
  }
  if (filter.accountIds?.length) {
    if (!it.accountId || !filter.accountIds.includes(it.accountId)) return false;
  }
  if (filter.methodIds?.length) {
    if (!it.methodId || !filter.methodIds.includes(it.methodId)) return false;
  }
  if (filter.bankIds?.length) {
    if (!it.bankId || !filter.bankIds.includes(it.bankId)) return false;
  }
  if (filter.tagIds?.length) {
    if (!it.tags.some((t) => filter.tagIds?.includes(t.id))) return false;
  }
  const q = filter.search?.trim().toLowerCase();
  if (q) {
    const hay = [
      it.name,
      it.notes ?? '',
      it.accountName ?? '',
      it.methodName ?? '',
      it.bankName ?? '',
      ...it.tags.map((t) => t.name),
    ]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function applySpendFilter(
  items: SpendItem[],
  filter: SpendFilterConfig | undefined,
): SpendItem[] {
  if (!filter) return items;
  return items.filter((it) => matchesFilter(it, filter));
}

/** True when the filter constrains anything (for a "N active" badge). */
export function spendFilterCount(f: SpendFilterConfig | undefined): number {
  if (!f) return 0;
  return (
    (f.search?.trim() ? 1 : 0) +
    (f.source ? 1 : 0) +
    (f.budgeted != null ? 1 : 0) +
    (f.amountMinMinor != null || f.amountMaxMinor != null ? 1 : 0) +
    (f.accountIds?.length ?? 0) +
    (f.tagIds?.length ?? 0) +
    (f.methodIds?.length ?? 0) +
    (f.bankIds?.length ?? 0)
  );
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

/** One bar / slice of a custom chart. */
export interface SeriesPoint {
  key: string;
  label: string;
  /** Minor units when the measure is money; a plain item count otherwise. */
  value: number;
  /** The entity's own colour, or `null` to fall back to the palette. */
  color: string | null;
}

export interface ChartSeries {
  id: string;
  kind: DashboardChartKind;
  title: string;
  config: DashboardChartConfig;
  currency: string;
  /** How to draw `points`. */
  display: ChartDisplay;
  /** `false` when the measure is a count (no currency formatting). */
  isMoney: boolean;
  /** The chart's groups, ready to render. */
  points: SeriesPoint[];
  /** `true` for time buckets (day / weekday) — hints denser axis labels. */
  categorical: boolean;
  /** Σ of every point's value (money minor units, or total count). */
  totalMinor: number;
  empty: boolean;
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
  /** recorded + planned for the month. */
  totalMinor: number;
  recordedMinor: number;
  recordedCount: number;
  plannedMinor: number;
  plannedCount: number;
}

/** The fixed top-of-dashboard summary: this month's recorded vs planned spend. */
export function statStrip(
  all: SpendItem[],
  month: string,
  currency: string,
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
  return {
    month,
    currency: currency.toUpperCase(),
    totalMinor: recordedMinor + plannedMinor,
    recordedMinor,
    recordedCount,
    plannedMinor,
    plannedCount,
  };
}

// --- custom charts -------------------------------------------------

/** Groups that place items on a time axis rather than in named categories. */
const TIME_GROUPS = new Set<ChartGroupBy>(['day', 'weekday']);

export function isTimeGroup(g: ChartGroupBy): boolean {
  return TIME_GROUPS.has(g);
}

/** Displays each group-by can drive. */
export function displaysFor(g: ChartGroupBy): ChartDisplay[] {
  return isTimeGroup(g) ? ['bar'] : ['bar', 'pie'];
}

/** Monday-first weekday order + labels. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

interface PointAcc {
  label: string;
  color: string | null;
  value: number;
}

function categoryOf(
  it: SpendItem,
  groupBy: ChartGroupBy,
): { key: string; label: string; color: string | null } {
  switch (groupBy) {
    case 'account':
      return {
        key: it.accountId ?? '__none__',
        label: it.accountName ?? 'No account',
        color: it.accountId ? it.accountColor : NEUTRAL,
      };
    case 'method':
      return {
        key: it.methodId ?? '__none__',
        label: it.methodName ?? 'No method',
        color: it.methodId ? null : NEUTRAL,
      };
    case 'bank':
      return {
        key: it.bankId ?? '__none__',
        label: it.bankName ?? 'No bank',
        color: it.bankId ? null : NEUTRAL,
      };
    case 'source':
      return {
        key: it.source,
        label: it.source === 'planned' ? 'Planned' : 'Expenses',
        color: null,
      };
    case 'budgeted':
      return {
        key: it.budgeted ? 'y' : 'n',
        label: it.budgeted ? 'Budgeted' : 'Unbudgeted',
        color: null,
      };
    default:
      return { key: '__none__', label: '—', color: null };
  }
}

/**
 * The renderable series for one custom chart: filter the month's rows, group
 * them, reduce each group by `sum` (money) or `count`, then order + cap.
 */
export function buildCustomSeries(
  config: DashboardChartConfig,
  items: SpendItem[],
  month: string,
  currency: string,
): Omit<ChartSeries, 'id' | 'kind' | 'title' | 'config'> {
  const groupBy: ChartGroupBy = config.groupBy ?? 'day';
  const measure = config.measure === 'count' ? 'count' : 'sum';
  const isMoney = measure === 'sum';
  const time = isTimeGroup(groupBy);
  const display: ChartDisplay =
    config.display && displaysFor(groupBy).includes(config.display)
      ? config.display
      : 'bar';

  const rows = applySpendFilter(itemsInMonth(items, month), config.filter);
  const acc = new Map<string, PointAcc>();
  const bump = (
    key: string,
    label: string,
    color: string | null,
    add: number,
  ) => {
    const cur = acc.get(key);
    if (cur) cur.value += add;
    else acc.set(key, { label, color, value: add });
  };

  // Pre-seed time slots so gaps render as zero bars.
  if (groupBy === 'day') {
    for (let d = 1; d <= daysIn(month); d++) {
      acc.set(String(d), { label: String(d), color: null, value: 0 });
    }
  } else if (groupBy === 'weekday') {
    for (const d of WEEKDAY_ORDER) {
      acc.set(String(d), {
        label: WEEKDAY_LABEL[d] ?? String(d),
        color: null,
        value: 0,
      });
    }
  }

  for (const it of rows) {
    if (groupBy === 'day') {
      const d = String(Number(it.date.slice(8, 10)));
      bump(d, d, null, measure === 'count' ? 1 : it.minor);
    } else if (groupBy === 'weekday') {
      const d = new Date(`${it.date}T00:00:00Z`).getUTCDay();
      bump(
        String(d),
        WEEKDAY_LABEL[d] ?? String(d),
        null,
        measure === 'count' ? 1 : it.minor,
      );
    } else if (groupBy === 'tag') {
      const tags = it.tags;
      if (tags.length === 0) {
        bump('__untagged__', 'Untagged', NEUTRAL, measure === 'count' ? 1 : it.minor);
      } else if (measure === 'count') {
        for (const t of tags) bump(t.id, t.name, t.color || null, 1);
      } else {
        const share = Math.round(it.minor / tags.length);
        tags.forEach((t, i) => {
          const v =
            i === tags.length - 1
              ? it.minor - share * (tags.length - 1)
              : share;
          bump(t.id, t.name, t.color || null, v);
        });
      }
    } else {
      const c = categoryOf(it, groupBy);
      bump(c.key, c.label, c.color, measure === 'count' ? 1 : it.minor);
    }
  }

  let points: SeriesPoint[] = [...acc.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    value: v.value,
    color: v.color,
  }));

  if (time) {
    const order =
      groupBy === 'weekday'
        ? new Map(WEEKDAY_ORDER.map((d, i) => [String(d), i]))
        : null;
    points.sort((a, b) =>
      order
        ? (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)
        : Number(a.key) - Number(b.key),
    );
  } else {
    points = points.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
    const limit = config.limit;
    if (limit && limit > 0 && points.length > limit) {
      const rest = points.slice(limit);
      points = points.slice(0, limit);
      points.push({
        key: '__other__',
        label: 'Other',
        value: rest.reduce((s, p) => s + p.value, 0),
        color: NEUTRAL,
      });
    }
  }

  const totalMinor = points.reduce((s, p) => s + p.value, 0);
  return {
    currency: currency.toUpperCase(),
    display,
    isMoney,
    points,
    categorical: !time,
    totalMinor,
    empty: points.every((p) => p.value === 0),
  };
}

// --- dispatch -------------------------------------------------------

export interface ChartInput {
  id: string;
  kind: DashboardChartKind;
  title: string;
  config: DashboardChartConfig;
}

/** Map a legacy preset row onto an equivalent custom-chart config. */
export function legacyChartConfig(
  kind: DashboardChartKind,
  config: DashboardChartConfig,
): DashboardChartConfig {
  switch (kind) {
    case 'month_spend_line':
      return { ...config, groupBy: 'day', measure: 'sum', display: 'bar' };
    case 'account_pie':
      return { ...config, groupBy: 'account', measure: 'sum', display: 'pie' };
    case 'tag_pie':
      return {
        ...config,
        groupBy: 'tag',
        measure: 'sum',
        display: 'pie',
        filter: config.includeTagIds
          ? { ...config.filter, tagIds: config.includeTagIds }
          : config.filter,
      };
    case 'category_bar':
      return {
        ...config,
        groupBy: config.dimension ?? 'account',
        measure: 'sum',
        display: 'bar',
      };
    default:
      return config;
  }
}

/** Build the renderable series for one chart card from the selected items. */
export function buildSeries(
  chart: ChartInput,
  items: SpendItem[],
  month: string,
  currency: string,
): ChartSeries {
  // A stored `groupBy` means the row has been (re)saved through the builder —
  // treat it as custom even if its `kind` is still a legacy preset name.
  const cfg = chart.config.groupBy
    ? chart.config
    : legacyChartConfig(chart.kind, chart.config);
  return {
    id: chart.id,
    kind: chart.kind,
    title: chart.title,
    config: chart.config,
    ...buildCustomSeries(cfg, items, month, currency),
  };
}

// --- custom stat tile ----------------------------------------------

const MEASURE_LABEL: Record<StatMeasure, string> = {
  sum: 'Total',
  count: 'Count',
  avg: 'Average',
  min: 'Smallest',
  max: 'Largest',
};

export interface StatCompare {
  prevValue: number;
  /** current − previous. */
  deltaValue: number;
  /** delta as a fraction of the previous value, or null when prev is 0. */
  deltaPct: number | null;
}

export interface StatResult {
  measure: StatMeasure;
  measureLabel: string;
  /** `count` is a plain integer; every other measure is money minor units. */
  value: number;
  isMoney: boolean;
  /** How many rows fed the stat. */
  matched: number;
  compare: StatCompare | null;
}

function reduce(items: SpendItem[], measure: StatMeasure): number {
  if (measure === 'count') return items.length;
  const amounts = items.map((it) => it.minor);
  if (amounts.length === 0) return 0;
  if (measure === 'sum') return amounts.reduce((a, b) => a + b, 0);
  if (measure === 'avg') {
    return Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }
  if (measure === 'min') return Math.min(...amounts);
  return Math.max(...amounts);
}

/**
 * One user-built stat. `all` holds items for the current **and** previous month
 * (so a `prev_month` compare needs no extra fetch); the month slicing happens
 * here. The tile's own `filter.source` wins over the dashboard source toggle,
 * so `all` should be unfiltered by source.
 */
export function computeStat(
  all: SpendItem[],
  config: DashboardChartConfig,
  month: string,
  prevMonth: string,
): StatResult {
  const measure: StatMeasure = config.measure ?? 'sum';
  const filtered = applySpendFilter(all, config.filter);
  const current = itemsInMonth(filtered, month);
  const value = reduce(current, measure);

  let compare: StatCompare | null = null;
  if (config.compare === 'prev_month') {
    const prev = reduce(itemsInMonth(filtered, prevMonth), measure);
    compare = {
      prevValue: prev,
      deltaValue: value - prev,
      deltaPct: prev === 0 ? null : (value - prev) / Math.abs(prev),
    };
  }

  return {
    measure,
    measureLabel: MEASURE_LABEL[measure],
    value,
    isMoney: measure !== 'count',
    matched: current.length,
    compare,
  };
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
