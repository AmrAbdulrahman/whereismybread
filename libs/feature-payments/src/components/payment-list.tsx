'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  addDays,
  addMonths,
  convertMoney,
  endOfMonth,
  formatMoney,
  money,
  startOfMonth,
  type RateMap,
} from '@wib/domain';
import { cn, Progress, Spinner } from '@wib/ui';
import { Pencil } from '@wib/ui/icons';
import { loadListWindowAction } from '../lib/actions';
import { riskFor, sumInDisplay } from '../lib/risk';
import type {
  BoardOccurrence,
  BudgetSummary,
  DayGroup,
  ExpenseLine,
  PaymentBoard,
} from '../lib/types';
import { BudgetMonthLine } from './budget-month-line';
import { ExpenseListItem } from './expense-list-item';
import {
  EMPTY_LIST_FILTER,
  listFilterCount,
  type ListFilterValue,
} from './list-filters';
import { ListMinimap } from './list-minimap';
import { MonthIncomeEditor } from './month-income-editor';
import { OccurrenceItem } from './occurrence-item';

function TodayMarker({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-label="Today">
      <span className="grid h-5 place-items-center rounded-full bg-accent px-2 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
        Today
      </span>
      <span className="h-px flex-1 bg-accent/30" />
      {label ? <span className="text-xs text-muted">{label}</span> : null}
    </div>
  );
}

function StartMarker() {
  return (
    <div
      className="flex h-9 items-center gap-3 text-xs font-medium text-muted"
      aria-label="Start of your history"
    >
      <span className="h-px flex-1 bg-line-strong" />
      This is where you started
      <span className="h-px flex-1 bg-line-strong" />
    </div>
  );
}

/** A greyed-out stand-in for a month that's still loading below the fold. */
function MonthSkeleton() {
  return (
    <section className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2 pb-2 pt-1">
        <div className="flex items-baseline justify-between border-b-2 border-line-strong pb-1.5">
          <div className="h-6 w-28 rounded bg-surface-2" />
          <div className="h-4 w-20 rounded bg-surface-2" />
        </div>
        <div className="h-2 w-full rounded-full bg-surface-2" />
      </div>
      <div className="h-14 rounded-lg bg-surface-2" />
      <div className="h-14 rounded-lg bg-surface-2" />
    </section>
  );
}

/** Roll occurrences up into the display currency, split by paid vs. still due. */
function monthTotals(
  occurrences: BoardOccurrence[],
  displayCurrency: string,
  rates: RateMap,
): { paidMinor: number; remainingMinor: number; totalMinor: number } {
  let paidMinor = 0;
  let totalMinor = 0;
  for (const o of occurrences) {
    const converted = convertMoney(o.amount, displayCurrency, rates);
    if (converted.currency !== displayCurrency.toUpperCase()) continue;
    totalMinor += converted.minorUnits;
    if (o.status === 'paid') paidMinor += converted.minorUnits;
  }
  return { paidMinor, remainingMinor: totalMinor - paidMinor, totalMinor };
}

function monthLabel(monthKey: string): string {
  const name = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${monthKey}-01T00:00:00Z`));
  return `${name}, ${monthKey.slice(0, 4)}`;
}

/** Fold earlier / later board slices onto the server-rendered window. */
function mergeBoards(
  base: PaymentBoard,
  past: PaymentBoard | null,
  future: PaymentBoard | null,
): PaymentBoard {
  const present = [base, past, future].filter(
    (b): b is PaymentBoard => b != null,
  );
  if (present.length === 1) return base;

  const seen = new Set<string>();
  const groups: DayGroup[] = [];
  for (const b of present) {
    for (const g of b.groups) {
      if (seen.has(g.date)) continue;
      seen.add(g.date);
      groups.push(g);
    }
  }
  groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    ...base,
    window: {
      from: present.reduce(
        (m, b) => (b.window.from < m ? b.window.from : m),
        base.window.from,
      ),
      to: present.reduce(
        (m, b) => (b.window.to > m ? b.window.to : m),
        base.window.to,
      ),
    },
    groups,
    incomeByMonth: Object.assign({}, ...present.map((b) => b.incomeByMonth)),
    incomeRawByMonth: Object.assign(
      {},
      ...present.map((b) => b.incomeRawByMonth),
    ),
    incomeOverrideByMonth: Object.assign(
      {},
      ...present.map((b) => b.incomeOverrideByMonth),
    ),
    overriddenIncomeMonths: [
      ...new Set(present.flatMap((b) => b.overriddenIncomeMonths)),
    ],
  };
}

export function PaymentList({
  board: baseBoard,
  budgets = [],
  expenses = [],
  filter = EMPTY_LIST_FILTER,
  stickyTop = 0,
  onEdit,
  onFlag,
  onEditBudget,
  onEditExpense,
  onAddExpense,
}: {
  board: PaymentBoard;
  budgets?: BudgetSummary[];
  expenses?: ExpenseLine[];
  filter?: ListFilterValue;
  /** Px offset for the sticky month headers — the height of the sticky panel. */
  stickyTop?: number;
  onEdit: (paymentId: string, dueDate: string) => void;
  onFlag: (paymentId: string, dueDate: string) => void;
  onEditBudget: (budget: BudgetSummary) => void;
  onEditExpense: (expense: ExpenseLine) => void;
  onAddExpense: (date: string) => void;
}) {
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const filterActive = listFilterCount(filter) > 0;

  // Months pulled in by scrolling past either end of the server window.
  const [pastBoard, setPastBoard] = useState<PaymentBoard | null>(null);
  const [futureBoard, setFutureBoard] = useState<PaymentBoard | null>(null);
  const [pastFrom, setPastFrom] = useState<string | null>(null);
  const [futureTo, setFutureTo] = useState<string | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [futureExhausted, setFutureExhausted] = useState(false);
  // Bumped whenever a slice finishes loading, so the fill effect re-evaluates
  // and can continue a cascade toward the start / bottom.
  const [loadTick, setLoadTick] = useState(0);
  const pastPending = useRef(false);
  const futurePending = useRef(false);
  // Set when the reader scrolls up near the top: keep pulling earlier months,
  // batch after batch, until the start. Cleared when they scroll back down.
  const chaseStart = useRef(false);
  // The "this is where you started" marker only appears once the reader has
  // actually scrolled up looking for earlier months — not on the first render.
  const [scrolledUp, setScrolledUp] = useState(false);

  const board = mergeBoards(baseBoard, pastBoard, futureBoard);
  const { displayCurrency, rates } = board;

  // Occurrences the user just ticked/unticked: keeps them sorted (paid → bottom
  // of their day) with a slide animation, before the board round-trips back.
  const [locallyPaid, setLocallyPaid] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // Drop optimistic entries the server board has caught up on.
    setLocallyPaid((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Record<string, boolean> = {};
      for (const b of [baseBoard, pastBoard, futureBoard])
        for (const g of b?.groups ?? [])
          for (const o of g.occurrences) {
            const p = prev[o.key];
            if (p !== undefined && p !== (o.status === 'paid')) next[o.key] = p;
          }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [baseBoard, pastBoard, futureBoard]);
  const isPaid = (o: BoardOccurrence) =>
    locallyPaid[o.key] ?? o.status === 'paid';
  const setLocalPaid = (key: string, paid: boolean) => {
    const apply = () => setLocallyPaid((p) => ({ ...p, [key]: paid }));
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      document.startViewTransition(() => flushSync(apply));
    } else {
      apply();
    }
  };

  const startedFloor = baseBoard.startedMonth
    ? `${baseBoard.startedMonth}-01`
    : null;
  const earliestLoaded = pastBoard?.window.from ?? baseBoard.window.from;
  const atStart = !startedFloor || earliestLoaded <= startedFloor;

  // Keep already-loaded slices in sync when the server board changes under us
  // (an edit / add / delete / mark-paid triggers a `router.refresh()`).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let cancelled = false;
    setFutureExhausted(false);
    void (async () => {
      if (pastFrom) {
        const r = await loadListWindowAction({
          from: pastFrom,
          to: addDays(baseBoard.window.from, -1),
        });
        if (!cancelled && r.ok) setPastBoard(r.board);
      }
      if (futureTo) {
        const r = await loadListWindowAction({
          from: addDays(baseBoard.window.to, 1),
          to: futureTo,
        });
        if (!cancelled && r.ok) setFutureBoard(r.board);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when the server board changes
  }, [baseBoard]);

  // Prepending months pushes everything down. Pin whichever month sits nearest
  // the top of the viewport, apply the update synchronously, then re-scroll to
  // it — so the content under the reader's eyes doesn't jump.
  const headerRefs = useRef(new Map<string, HTMLElement>());
  const sectionTop = (key: string) =>
    headerRefs.current.get(key)?.parentElement?.getBoundingClientRect().top ??
    null;
  const topmostMonthKey = () => {
    let key: string | null = null;
    let best = Infinity;
    for (const k of headerRefs.current.keys()) {
      const top = sectionTop(k);
      if (top == null) continue;
      if (Math.abs(top) < best) {
        best = Math.abs(top);
        key = k;
      }
    }
    return key;
  };

  // Timeline "jump to month": scroll if it's already rendered, otherwise load
  // the slice that contains it and scroll once it lands.
  const pendingScrollKey = useRef<string | null>(null);
  const scrollToSection = (key: string) => {
    const el = headerRefs.current.get(key)?.parentElement;
    if (!el) return false;
    const y = window.scrollY + el.getBoundingClientRect().top - stickyTop - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    return true;
  };
  const jumpToMonth = (key: string) => {
    if (scrollToSection(key)) return;
    const first = `${key}-01`;
    if (startedFloor && first < startedFloor) return;
    pendingScrollKey.current = key;
    if (first < earliestLoaded) {
      void loadListWindowAction({
        from: first,
        to: addDays(baseBoard.window.from, -1),
      }).then((r) => {
        if (r.ok) {
          setPastBoard(r.board);
          setPastFrom(first);
        }
      });
    } else {
      const to = endOfMonth(addMonths(first, 1));
      void loadListWindowAction({
        from: addDays(baseBoard.window.to, 1),
        to,
      }).then((r) => {
        if (r.ok) {
          setFutureBoard(r.board);
          setFutureTo(to);
        }
      });
    }
  };
  useEffect(() => {
    const key = pendingScrollKey.current;
    if (key && scrollToSection(key)) pendingScrollKey.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retry once the slice renders
  }, [pastBoard, futureBoard, baseBoard]);

  const loadPast = () => {
    if (loadingPast || pastPending.current || atStart) return;
    const cursor = pastFrom ?? baseBoard.window.from;
    let newFrom = startOfMonth(addMonths(cursor, -2));
    if (startedFloor && newFrom < startedFloor) newFrom = startedFloor;
    if (newFrom >= cursor) return;
    const to = addDays(baseBoard.window.from, -1);

    pastPending.current = true;
    setLoadingPast(true);
    void loadListWindowAction({ from: newFrom, to })
      .then((r) => {
        if (!r.ok) return;
        const anchorKey = topmostMonthKey();
        const before = anchorKey ? sectionTop(anchorKey) : null;
        flushSync(() => {
          setPastBoard(r.board);
          setPastFrom(newFrom);
        });
        const after = anchorKey ? sectionTop(anchorKey) : null;
        if (before != null && after != null && Math.abs(after - before) > 1) {
          window.scrollBy(0, after - before);
        }
      })
      .finally(() => {
        setLoadingPast(false);
        pastPending.current = false;
        setLoadTick((n) => n + 1);
      });
  };

  const loadFuture = () => {
    if (loadingFuture || futurePending.current || futureExhausted) return;
    const cursor = futureTo ?? baseBoard.window.to;
    const newTo = endOfMonth(addMonths(cursor, 2));
    const from = addDays(baseBoard.window.to, 1);

    futurePending.current = true;
    setLoadingFuture(true);
    void loadListWindowAction({ from, to: newTo })
      .then((r) => {
        if (r.ok) {
          // Nothing beyond what we already had → the schedule ends here.
          if (!r.board.groups.some((g) => g.date > cursor)) {
            setFutureExhausted(true);
          }
          setFutureBoard(r.board);
          setFutureTo(newTo);
        }
      })
      .finally(() => {
        setLoadingFuture(false);
        futurePending.current = false;
        setLoadTick((n) => n + 1);
      });
  };

  // Latest closures for the scroll handler, which is wired up once.
  const loadPastRef = useRef(loadPast);
  const loadFutureRef = useRef(loadFuture);
  loadPastRef.current = loadPast;
  loadFutureRef.current = loadFuture;

  // Scrolling toward the top pulls earlier months in; scrolling toward the
  // bottom pulls later ones. The near-top load also re-triggers the priming
  // effect below, so a sustained scroll up keeps the history coming.
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    const check = () => {
      const doc = document.documentElement;
      const y = window.scrollY;
      const dir = y - lastY;
      lastY = y;
      const vh = window.innerHeight || doc.clientHeight;
      if (dir < 0 && y < vh) {
        chaseStart.current = true;
        setScrolledUp(true);
        loadPastRef.current();
      } else if (dir > 0 && y > vh * 2) {
        chaseStart.current = false;
      }
      if (dir > 0 && doc.scrollHeight - (y + vh) < vh) {
        loadFutureRef.current();
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Keep the list filled. Future: top it up whenever it's shorter than the
  // viewport. Past: prime one batch on mount so the top isn't a dead end (you
  // can't scroll up from the very top), then — once the reader heads for the
  // top — cascade batch after batch until the start. Past prepends are
  // scroll-anchored so this stays invisible: the viewport holds still and
  // earlier months stack up just above it. Both ends stop on their own.
  // Paused while a filter is on — a narrow match could otherwise loop forever
  // trying to fill the screen; scrolling still loads more on demand.
  useEffect(() => {
    if (filterActive) return;
    const vh = window.innerHeight;
    const sh = document.documentElement.scrollHeight;
    if (!futureExhausted && !loadingFuture && sh <= vh + 240) {
      loadFutureRef.current();
    }
    if (
      !atStart &&
      !loadingPast &&
      !pastPending.current &&
      (pastFrom == null || chaseStart.current || sh <= vh + 240)
    ) {
      loadPastRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-checks after each slice lands
  }, [pastBoard, futureBoard, atStart, futureExhausted, loadTick, filterActive]);

  // Search / account / bank / tag filter — matched against the occurrence and
  // its payment's notes.
  const matchesFilter = (occ: BoardOccurrence): boolean => {
    if (
      filter.accountIds.length > 0 &&
      !(occ.account && filter.accountIds.includes(occ.account.id))
    ) {
      return false;
    }
    if (
      filter.bankIds.length > 0 &&
      !(occ.bank && filter.bankIds.includes(occ.bank.id))
    ) {
      return false;
    }
    if (
      filter.tagIds.length > 0 &&
      !occ.tags.some((t) => filter.tagIds.includes(t.id))
    ) {
      return false;
    }
    const q = filter.search.trim().toLowerCase();
    if (q) {
      const notes = board.editable[occ.paymentId]?.notes ?? '';
      const hay = `${occ.name}\n${notes}\n${occ.url ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // Budgets/expenses are unrelated to the payment filter fields (account,
  // bank, tag) — rather than show them against a narrowed, unrelated view,
  // they're hidden for as long as a filter is active.
  const showBudgetsAndExpenses = !filterActive;
  const expensesByDate = new Map<string, ExpenseLine[]>();
  for (const e of expenses) {
    if (e.date < board.window.from || e.date > board.window.to) continue;
    const arr = expensesByDate.get(e.date);
    if (arr) arr.push(e);
    else expensesByDate.set(e.date, [e]);
  }

  // Show everything that isn't skipped — paid occurrences stay in place with
  // their checkbox ticked (earlier this month, or in months scrolled back in).
  const upcoming = (() => {
    const base = board.groups
      .map((g) => ({
        ...g,
        occurrences: g.occurrences.filter(
          (o) => matchesFilter(o) && o.status !== 'skipped',
        ),
      }))
      .filter((g) => g.occurrences.length > 0);
    if (!showBudgetsAndExpenses) return base;
    // A date with an expense but no payment still needs its own day section.
    const seen = new Set(base.map((g) => g.date));
    const extra: DayGroup[] = [...expensesByDate.keys()]
      .filter((d) => !seen.has(d))
      .map((d) => ({
        date: d,
        relativeLabel: '',
        occurrences: [],
        totalMinor: 0,
        currency: displayCurrency,
      }));
    return [...base, ...extra].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  })();
  const todayHasPayments = upcoming.some(
    (g) => g.date === board.today && g.occurrences.length > 0,
  );

  // Bucket the day groups by calendar month, in order.
  const months: { key: string; groups: DayGroup[] }[] = [];
  for (const group of upcoming) {
    const key = group.date.slice(0, 7);
    let bucket = months.at(-1);
    if (!bucket || bucket.key !== key) {
      bucket = { key, groups: [] };
      months.push(bucket);
    }
    bucket.groups.push(group);
  }

  const todayMonth = board.today.slice(0, 7);
  const defaultKey =
    months.find((m) => m.key === todayMonth)?.key ?? months[0]?.key ?? '';

  // The active month follows the scroll: whichever month fills the most of the
  // viewport is highlighted (so scrolling up lights it as soon as it's in view,
  // not once its header reaches the top); the rest fade back.
  const [scrolledKey, setScrolledKey] = useState<string | null>(null);
  const monthKeys = months.map((m) => m.key).join(',');
  const activeKey =
    scrolledKey && months.some((m) => m.key === scrolledKey)
      ? scrolledKey
      : defaultKey;

  // Timeline rail bounds: the start of history through a little past the last
  // loaded month (or the furthest one, once there's nothing more to load).
  const loadedMonthKeys = new Set(months.map((m) => m.key));
  const minimapFrom = (
    startedFloor ??
    `${months[0]?.key ?? todayMonth}-01`
  ).slice(0, 7);
  const lastLoadedKey = months.at(-1)?.key ?? todayMonth;
  const sixOut = addMonths(`${todayMonth}-01`, 6).slice(0, 7);
  const minimapTo = futureExhausted
    ? lastLoadedKey
    : lastLoadedKey > sixOut
      ? lastLoadedKey
      : sixOut;
  const minimapSpan =
    (Number(minimapTo.slice(0, 4)) - Number(minimapFrom.slice(0, 4))) * 12 +
    Number(minimapTo.slice(5, 7)) -
    Number(minimapFrom.slice(5, 7)) +
    1;
  const showMinimap = minimapSpan >= 3;
  const goToday = () => jumpToMonth(todayMonth);

  useEffect(() => {
    const order = monthKeys ? monthKeys.split(',') : [];
    if (order.length === 0) return;

    const pick = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      let best: string | null = null;
      let bestVisible = 0;
      for (const key of order) {
        const section = headerRefs.current.get(key)?.parentElement;
        if (!section) continue;
        const r = section.getBoundingClientRect();
        const visible = Math.min(r.bottom, vh) - Math.max(r.top, stickyTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = key;
        }
      }
      if (best) setScrolledKey(best);
    };

    pick();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [monthKeys, stickyTop]);

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {filterActive ? null : <TodayMarker />}
        <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          {filterActive
            ? 'No payments match your filters in the months loaded so far. Scroll to load more, or clear the filters.'
            : 'Nothing scheduled in this window. Add a payment to get started.'}
        </p>
      </div>
    );
  }

  const editing = editingMonth
    ? {
        key: editingMonth,
        label: monthLabel(editingMonth),
        effective: board.incomeRawByMonth[editingMonth] ?? {
          minor: board.globalIncomeMinor,
          currency: board.incomeCurrency,
        },
        override: board.incomeOverrideByMonth[editingMonth] ?? null,
        isOverride: board.overriddenIncomeMonths.includes(editingMonth),
      }
    : null;

  return (
    <div
      className={cn('flex flex-col gap-8', showMinimap && 'sm:pr-16')}
    >
      {showMinimap ? (
        <ListMinimap
          fromKey={minimapFrom}
          toKey={minimapTo}
          loaded={loadedMonthKeys}
          activeKey={activeKey}
          todayKey={todayMonth}
          stickyTop={stickyTop}
          onJump={jumpToMonth}
          onToday={goToday}
        />
      ) : null}
      {atStart ? (
        scrolledUp ? <StartMarker /> : null
      ) : (
        <div className="flex h-9 items-center justify-center gap-2 text-xs text-muted">
          {loadingPast ? (
            <>
              <Spinner />
              Loading earlier months…
            </>
          ) : null}
        </div>
      )}

      {months.map((mo) => {
        const isActive = mo.key === activeKey;
        const occs = mo.groups.flatMap((g) => g.occurrences);
        const monthStart = `${mo.key}-01`;
        const monthEnd = endOfMonth(monthStart);
        // A budget counts toward the month like a payment would (it's money
        // reserved); an unbudgeted expense counts too (money already spent).
        // A budgeted expense doesn't count separately — its budget already
        // does — it's shown but excluded here.
        const monthBudgets = showBudgetsAndExpenses
          ? budgets.filter(
              (b) => b.startDate <= monthEnd && b.endDate >= monthStart,
            )
          : [];
        const monthUnbudgetedExpenses = showBudgetsAndExpenses
          ? expenses.filter(
              (e) => e.date.slice(0, 7) === mo.key && !e.budgetId,
            )
          : [];
        const extraMinor = sumInDisplay(
          [
            ...monthBudgets.map((b) => b.limit),
            ...monthUnbudgetedExpenses.map((e) => e.amount),
          ],
          displayCurrency,
          rates,
        );
        const {
          paidMinor,
          remainingMinor: paymentsRemainingMinor,
          totalMinor: paymentsTotalMinor,
        } = monthTotals(occs, displayCurrency, rates);
        // Reserved/spent amounts have no paid state of their own — they only
        // ever sit on the "remaining" side of the split.
        const totalMinor = paymentsTotalMinor + extraMinor;
        const remainingMinor = paymentsRemainingMinor + extraMinor;
        const paidPct = totalMinor > 0 ? (paidMinor / totalMinor) * 100 : 0;

        const incomeMinor =
          board.incomeByMonth[mo.key] ?? board.defaultIncomeMinor;
        const isIncomeOverride = board.overriddenIncomeMonths.includes(mo.key);
        const hasIncome = incomeMinor > 0;
        const leftMinor = incomeMinor - totalMinor;
        const risk = riskFor(totalMinor, incomeMinor);
        const spendPct = hasIncome ? (totalMinor / incomeMinor) * 100 : 0;

        return (
          <section
            key={mo.key}
            className={cn(
              'flex flex-col gap-4 transition-opacity duration-200',
              !isActive && 'opacity-30',
            )}
          >
            <div
              ref={(el) => {
                if (el) headerRefs.current.set(mo.key, el);
                else headerRefs.current.delete(mo.key);
              }}
              data-month-key={mo.key}
              style={{ top: stickyTop }}
              className="sticky z-20 flex flex-col gap-2 bg-ground pb-2 pt-1"
            >
              <div
                className={cn(
                  'flex items-baseline justify-between border-b-2 pb-1.5',
                  isActive ? 'border-accent' : 'border-line-strong',
                )}
              >
                <h3
                  className={cn(
                    'font-display text-lg font-semibold',
                    isActive ? 'text-ink' : 'text-ink-soft',
                  )}
                >
                  {monthLabel(mo.key)}
                </h3>
                <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {formatMoney(money(totalMinor, displayCurrency))}
                </span>
              </div>
              {hasIncome ? (
                <>
                  <Progress value={spendPct} indicatorClassName={risk.bar} />
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditingMonth(mo.key)}
                      className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink"
                    >
                      <span>
                        Income{' '}
                        <span className="font-medium tabular-nums text-ink">
                          {formatMoney(money(incomeMinor, displayCurrency))}
                        </span>
                        {isIncomeOverride ? (
                          <span className="ml-1 text-muted">· custom</span>
                        ) : null}
                      </span>
                      <Pencil size={12} className="opacity-60" />
                    </button>
                    <span
                      className={cn('font-medium tabular-nums', risk.text)}
                    >
                      {leftMinor >= 0
                        ? `${formatMoney(money(leftMinor, displayCurrency))} left`
                        : `${formatMoney(
                            money(-leftMinor, displayCurrency),
                          )} over`}
                      {' · '}
                      {risk.label}
                    </span>
                  </div>
                  {totalMinor > 0 ? (
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span className="font-medium text-teal">
                        {formatMoney(money(paidMinor, displayCurrency))} paid
                      </span>
                      <span>
                        {formatMoney(money(remainingMinor, displayCurrency))}{' '}
                        still due
                      </span>
                    </div>
                  ) : null}
                </>
              ) : totalMinor > 0 ? (
                <>
                  <Progress value={paidPct} className="bg-warn/20" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-teal">
                      {formatMoney(money(paidMinor, displayCurrency))} paid
                    </span>
                    <span className="font-medium text-warn">
                      {formatMoney(money(remainingMinor, displayCurrency))}{' '}
                      remaining
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingMonth(mo.key)}
                    className="inline-flex items-center gap-1.5 self-start text-xs text-muted hover:text-ink"
                  >
                    <Pencil size={12} />
                    Add a monthly income to gauge risk
                  </button>
                </>
              ) : null}
            </div>

            {monthBudgets.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {monthBudgets.map((b) => (
                  <BudgetMonthLine
                    key={b.id}
                    budget={b}
                    onEdit={() => onEditBudget(b)}
                  />
                ))}
              </div>
            ) : null}

            {mo.key === todayMonth && !todayHasPayments ? (
              <TodayMarker label="Nothing due today" />
            ) : null}

            {mo.groups.map((group) => {
              const isToday = group.date === board.today;
              const dayExpenses = showBudgetsAndExpenses
                ? (expensesByDate.get(group.date) ?? [])
                : [];
              const dayUnbudgetedExpenses = dayExpenses.filter(
                (e) => !e.budgetId,
              );
              // Recompute from the (filtered) occurrences, in the display
              // currency — so a mixed-currency day adds up correctly. An
              // unbudgeted expense adds on top, like a one-time payment; a
              // budgeted one doesn't (its budget already counts, monthly).
              const dayTotalMinor =
                monthTotals(group.occurrences, displayCurrency, rates)
                  .totalMinor +
                sumInDisplay(
                  dayUnbudgetedExpenses.map((e) => e.amount),
                  displayCurrency,
                  rates,
                );
              return (
                <div key={group.date} className="flex flex-col gap-2">
                  <div
                    className={cn(
                      'flex items-baseline justify-between border-b pb-1',
                      isToday ? 'border-accent/50' : 'border-line',
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center gap-2 font-display text-sm font-semibold',
                        isToday ? 'text-accent' : 'text-ink',
                      )}
                    >
                      {isToday ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                          Today
                        </span>
                      ) : null}
                      {new Intl.DateTimeFormat('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      }).format(new Date(`${group.date}T00:00:00Z`))}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {!isToday &&
                      /^(Tomorrow|Yesterday|in \d|\d+ days ago)/.test(
                        group.relativeLabel,
                      ) ? (
                        <span>{group.relativeLabel}</span>
                      ) : null}
                      {showBudgetsAndExpenses ? (
                        <button
                          type="button"
                          onClick={() => onAddExpense(group.date)}
                          className="font-medium text-ink-soft hover:text-ink hover:underline"
                        >
                          + expense
                        </button>
                      ) : null}
                      {dayTotalMinor > 0 ? (
                        <span className="font-mono tabular-nums">
                          {formatMoney(money(dayTotalMinor, displayCurrency))}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {[...group.occurrences]
                      .sort((a, b) => Number(isPaid(a)) - Number(isPaid(b)))
                      .map((occ) => (
                        <div
                          key={occ.key}
                          style={{
                            viewTransitionName: `o-${occ.key.replace(
                              /[^\w-]/g,
                              '_',
                            )}`,
                          }}
                        >
                          <OccurrenceItem
                            occ={occ}
                            onEdit={onEdit}
                            onFlag={onFlag}
                            onToggle={(paid) => setLocalPaid(occ.key, paid)}
                            displayCurrency={displayCurrency}
                            rates={rates}
                            today={board.today}
                          />
                        </div>
                      ))}
                    {dayExpenses.map((e) => (
                      <ExpenseListItem
                        key={e.id}
                        expense={e}
                        onEdit={() => onEditExpense(e)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {loadingFuture ? (
        <>
          <MonthSkeleton />
          <MonthSkeleton />
        </>
      ) : null}

      {editing ? (
        <MonthIncomeEditor
          open
          onOpenChange={(o) => !o && setEditingMonth(null)}
          month={editing.key}
          monthLabel={editing.label}
          mode={board.incomeMode}
          hourlyRateMinor={board.hourlyRateMinor}
          defaultHours={board.monthlyHours}
          override={editing.override}
          effectiveRawMinor={editing.effective.minor}
          effectiveCurrency={editing.effective.currency}
          globalRawMinor={board.globalIncomeMinor}
          incomeCurrency={board.incomeCurrency}
          usedCurrencies={board.usedCurrencies}
          isOverride={editing.isOverride}
        />
      ) : null}
    </div>
  );
}
