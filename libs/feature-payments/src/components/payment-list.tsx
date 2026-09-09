'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
import type { Account, Tag } from '@wib/db';
import { cn, Progress, Spinner } from '@wib/ui';
import { ArrowDown, ArrowUp, Check, ChevronDown, Pencil } from '@wib/ui/icons';
import { loadListWindowAction } from '../lib/actions';
import { riskFor, sumInDisplay } from '../lib/risk';
import type {
  BoardOccurrence,
  BudgetSummary,
  DayGroup,
  ExpenseLine,
  PaymentBoard,
} from '../lib/types';
import { BankTransactionRow as BankTransactionRowComponent } from './bank-transaction-row';
import type { BankTransactionRow } from '../lib/bank-sync-queries';
import { BudgetMonthGroup } from './budget-month-group';
import { ExpenseListItem } from './expense-list-item';
import { InfoHint } from './info-hint';
import { budgetAssignOptions } from './inline-assign-chip';
import {
  EMPTY_LIST_FILTER,
  listFilterCount,
  expenseIncompatibleFilterActive,
  paymentAttrFilterActive,
  type ListFilterValue,
} from './list-filters';
import { ListMinimap } from './list-minimap';
import { MonthIncomeEditor } from './month-income-editor';
import { OccurrenceItem } from './occurrence-item';

/** How much of a day's list is shown. */
type DayMode = 'collapsed' | 'compact' | 'expanded';

function TodayMarker({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-label="Today" data-plan-today>
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
  accounts = [],
  tags = [],
  expenses = [],
  reviewTransactions = [],
  filter = EMPTY_LIST_FILTER,
  unpaidOnly = false,
  flaggedOnly = false,
  stickyTop = 0,
  goTodayRef,
  hideOccurrence,
  highlightOccurrence,
  highlightExpense,
  onEdit,
  onFlag,
  onDelete,
  onCreateAutomation,
  onEditBudget,
  onEditExpense,
  onDeleteExpense,
  onAddExpense,
  onReviewExpense,
  onReviewPayment,
  onReviewIgnore,
  onReviewDetails,
  onReviewCreateAutomation,
}: {
  board: PaymentBoard;
  budgets?: BudgetSummary[];
  /** Accounts to offer in the inline "+ account" chip on plan cards. */
  accounts?: Account[];
  /** Tags to suggest in the inline "+ tag" chip on plan cards. */
  tags?: Tag[];
  expenses?: ExpenseLine[];
  /** Uncategorized imported transactions — shown per-day, never in any total. */
  reviewTransactions?: BankTransactionRow[];
  filter?: ListFilterValue;
  /** Hide paid occurrences; days left with nothing to show drop out entirely. */
  unpaidOnly?: boolean;
  /** Show only flagged occurrences (and, like unpaid-only, drop expenses). */
  flaggedOnly?: boolean;
  /** Px offset for the sticky month headers — the height of the sticky panel. */
  stickyTop?: number;
  /**
   * Filled with a "scroll to today" callback so an outside control (the
   * mobile header button) can trigger the same jump as the timeline rail.
   */
  goTodayRef?: { current: (() => void) | null };
  /** Hide an occurrence client-side — an optimistically-deleted row. */
  hideOccurrence?: (occ: BoardOccurrence) => boolean;
  /** Briefly flash an occurrence — a push-notification deep link landed on it. */
  highlightOccurrence?: (occ: BoardOccurrence) => boolean;
  /** Same, for a recorded expense row. */
  highlightExpense?: (id: string) => boolean;
  onEdit: (paymentId: string, dueDate: string) => void;
  onFlag: (paymentId: string, dueDate: string) => void;
  onDelete?: (paymentId: string, dueDate: string) => void;
  /** Open the "new automation" dialog pre-filled to match this row. */
  onCreateAutomation?: (name: string, amountMinor: number) => void;
  onEditBudget: (budget: BudgetSummary) => void;
  onEditExpense: (expense: ExpenseLine) => void;
  onDeleteExpense?: (expense: ExpenseLine) => void;
  onAddExpense: (date: string) => void;
  onReviewExpense?: (txn: BankTransactionRow) => void;
  onReviewPayment?: (txn: BankTransactionRow) => void;
  onReviewIgnore?: (txn: BankTransactionRow) => void;
  onReviewDetails?: (txn: BankTransactionRow) => void;
  onReviewCreateAutomation?: (txn: BankTransactionRow) => void;
}) {
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const filterActive = listFilterCount(filter) > 0;
  // While a text search is running the list is a cross-month subset, so the
  // per-month / per-day roll-ups would be a partial figure dressed up as the
  // real one — hide them entirely until the search clears.
  const searchActive = filter.search.trim().length > 0;

  // Per-day expansion. Past days default to `compact` (only what still needs
  // action — unpaid payments + transactions to review); today and future
  // default to `expanded`. Clicking the day's chevron cycles
  // collapsed -> compact ("needs action") -> expanded — but a day with
  // nothing that needs action has no meaningful `compact` state, so it just
  // toggles collapsed <-> expanded.
  const [dayModes, setDayModes] = useState<ReadonlyMap<string, DayMode>>(
    new Map(),
  );
  const defaultDayMode = (date: string): DayMode =>
    date < baseBoard.today ? 'compact' : 'expanded';
  /** The mode actually shown — `compact` folds to `collapsed` when there's nothing to compact. */
  const dayModeFor = (
    date: string,
    actionable: boolean,
    stored: DayMode = dayModes.get(date) ?? defaultDayMode(date),
  ): DayMode => (!actionable && stored === 'compact' ? 'collapsed' : stored);
  const cycleDayMode = (date: string, actionable: boolean) =>
    setDayModes((prev) => {
      const from = dayModeFor(
        date,
        actionable,
        prev.get(date) ?? defaultDayMode(date),
      );
      const next: DayMode = actionable
        ? from === 'collapsed'
          ? 'compact'
          : from === 'compact'
            ? 'expanded'
            : 'collapsed'
        : from === 'collapsed'
          ? 'expanded'
          : 'collapsed';
      const m = new Map(prev);
      m.set(date, next);
      return m;
    });

  const attrFilterActive = paymentAttrFilterActive(filter);
  const expenseIncompatibleFilter = expenseIncompatibleFilterActive(filter);
  const wantKind = (k: 'planned' | 'budgeted' | 'unbudgeted') =>
    filter.kinds.length === 0 || filter.kinds.includes(k);
  const wantPlanned = wantKind('planned');
  /** An expense passes the account/tag chips (the only attrs it carries). */
  const matchesExpenseFilter = (e: ExpenseLine): boolean => {
    if (
      filter.accountIds.length > 0 &&
      !(e.accountId && filter.accountIds.includes(e.accountId))
    ) {
      return false;
    }
    if (
      filter.tagIds.length > 0 &&
      !e.tags.some((t) => filter.tagIds.includes(t.id))
    ) {
      return false;
    }
    return true;
  };

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

  // Option lists for the inline "+ account" / "+ budget" chips on plan cards.
  const assignChips = useMemo(
    () => ({
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
      })),
      budgets: budgetAssignOptions(budgets),
      tags: tags.map((t) => ({ name: t.name, color: t.color })),
    }),
    [accounts, budgets, tags],
  );

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
      return Object.keys(next).length === Object.keys(prev).length
        ? prev
        : next;
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

  // The forward horizon a filter/search must reach before it can settle: at
  // least the next 12 months from today, so a query matches everything coming
  // up — not just the ~4 months the server pre-loaded. Cascades in `loadFuture`
  // batches (each bump of `loadTick` re-runs this) and still stops early on
  // `futureExhausted` when the schedule genuinely ends before then.
  const filterHorizon = endOfMonth(
    addMonths(`${board.today.slice(0, 7)}-01`, 12),
  );

  // Keep the list filled. Future: top it up whenever it's shorter than the
  // viewport. Past: prime one batch on mount so the top isn't a dead end (you
  // can't scroll up from the very top), then — once the reader heads for the
  // top — cascade batch after batch until the start. Past prepends are
  // scroll-anchored so this stays invisible: the viewport holds still and
  // earlier months stack up just above it. Both ends stop on their own.
  // While a filter is on, the viewport-fill heuristic is skipped (a narrow
  // match could loop forever trying to fill the screen). Widening the window to
  // `filterHorizon` is handled by its own effect below.
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
  }, [
    pastBoard,
    futureBoard,
    atStart,
    futureExhausted,
    loadTick,
    filterActive,
  ]);

  // Turning on a filter/search widens the future window in one shot to
  // `filterHorizon` (≥12 months out), so the query is matched against the whole
  // year ahead, not only the months the server pre-loaded or the reader has
  // scrolled to. `loadFuture`'s incremental cascade can stop early at a gap in
  // the schedule, so this bypasses it with a single dated request. Gated on
  // `pastFrom == null` isn't needed — this only touches the future slice.
  const filterFetchPending = useRef(false);
  const [filterLoading, setFilterLoading] = useState(false);
  useEffect(() => {
    if (!filterActive || filterFetchPending.current) return;
    const loadedTo = futureTo ?? baseBoard.window.to;
    if (loadedTo >= filterHorizon) return;
    filterFetchPending.current = true;
    setFilterLoading(true);
    let cancelled = false;
    void loadListWindowAction({
      from: addDays(baseBoard.window.to, 1),
      to: filterHorizon,
    })
      .then((r) => {
        if (cancelled || !r.ok) return;
        setFutureBoard(r.board);
        setFutureTo(filterHorizon);
      })
      .finally(() => {
        filterFetchPending.current = false;
        if (!cancelled) setFilterLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs when the filter toggles or the server board changes
  }, [filterActive, filterHorizon, baseBoard]);

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
      filter.methodIds.length > 0 &&
      !(occ.method && filter.methodIds.includes(occ.method.id))
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

  // A budget *line* has no account/bank/method/tag, so any payment-attribute
  // filter hides it. Individual expenses do carry an account + tags now, so
  // they survive an account/tag filter (matched below) — only a filter they
  // can't satisfy (search / bank / method) hides them. The "Show" kinds
  // filter narrows further. "Unpaid only" is about outstanding payments —
  // expenses are records of money already spent and budget lines aren't a
  // payment at all, so both drop out entirely under it.
  // "Flagged only" is a payments concept too — expenses and budget lines
  // can't be flagged, so they drop out under it just like unpaid-only.
  const hideNonPayments = unpaidOnly || flaggedOnly;
  const showBudgetLines =
    !hideNonPayments && !attrFilterActive && wantKind('budgeted');
  const showBudgeted =
    !hideNonPayments && !expenseIncompatibleFilter && wantKind('budgeted');
  const showUnbudgeted =
    !hideNonPayments && !expenseIncompatibleFilter && wantKind('unbudgeted');
  const showBudgetsAndExpenses =
    showBudgetLines || showBudgeted || showUnbudgeted;
  const expensesByDate = new Map<string, ExpenseLine[]>();
  for (const e of expenses) {
    if (e.date < board.window.from || e.date > board.window.to) continue;
    const budgeted = e.budgetId != null;
    if (budgeted ? !showBudgeted : !showUnbudgeted) continue;
    if (!matchesExpenseFilter(e)) continue;
    const arr = expensesByDate.get(e.date);
    if (arr) arr.push(e);
    else expensesByDate.set(e.date, [e]);
  }

  // Uncategorized imported transactions, bucketed by their day — an inbox
  // nudge that vanishes once triaged, and never touches a total. Independent
  // of the "Show" kinds, but a filter/search is a deliberate "show me only X"
  // so the review rows step aside while one is on.
  const showReview = !filterActive;
  const reviewByDate = new Map<string, BankTransactionRow[]>();
  for (const txn of showReview ? reviewTransactions : []) {
    const d = txn.occurredAt.slice(0, 10);
    if (d < board.window.from || d > board.window.to) continue;
    const arr = reviewByDate.get(d);
    if (arr) arr.push(txn);
    else reviewByDate.set(d, [txn]);
  }
  const reviewOutsideWindow = showReview
    ? reviewTransactions.length -
      [...reviewByDate.values()].reduce((n, a) => n + a.length, 0)
    : 0;

  // Show everything that isn't skipped — paid occurrences stay in place with
  // their checkbox ticked (earlier this month, or in months scrolled back in),
  // unless "unpaid only" is on, in which case they drop out (and days left
  // with nothing at all — no unpaid occurrences, no expenses — drop too).
  const upcoming = (() => {
    const filteredGroups = board.groups.map((g) => ({
      ...g,
      occurrences: g.occurrences.filter(
        (o) =>
          wantPlanned &&
          matchesFilter(o) &&
          o.status !== 'skipped' &&
          (!unpaidOnly || !isPaid(o)) &&
          (!flaggedOnly ||
            o.instanceFlagNote != null ||
            o.seriesFlagNote != null) &&
          !hideOccurrence?.(o),
      ),
    }));
    const nonEmpty = filteredGroups.filter((g) => g.occurrences.length > 0);
    const firstMatch = nonEmpty[0]?.date;
    const lastMatch = nonEmpty[nonEmpty.length - 1]?.date;
    // With an attribute filter on, keep the emptied-out day headers that sit
    // *between* matches — so the list keeps its shape and you can see which
    // days had activity that's now filtered out. A text search is different:
    // it's a hunt for specific rows, so show only the days that actually
    // match. (Unpaid-only also prunes; empty days there are just noise.)
    const base =
      filterActive &&
      !unpaidOnly &&
      !flaggedOnly &&
      !searchActive &&
      firstMatch &&
      lastMatch
        ? filteredGroups.filter(
            (g) =>
              g.occurrences.length > 0 ||
              (g.date >= firstMatch && g.date <= lastMatch),
          )
        : nonEmpty;
    // A date with only an expense, or only a transaction to review, still
    // needs its own day section.
    const seen = new Set(base.map((g) => g.date));
    const extraDates = new Set<string>();
    if (showBudgetsAndExpenses) {
      for (const d of expensesByDate.keys())
        if (!seen.has(d)) extraDates.add(d);
    }
    for (const d of reviewByDate.keys()) if (!seen.has(d)) extraDates.add(d);
    if (extraDates.size === 0) return base;
    const extra: DayGroup[] = [...extraDates].map((d) => ({
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
  // Today gets a "Today" divider unless it already has its own dated section
  // (which carries a "Today" badge of its own).
  const todayHasOwnGroup = upcoming.some((g) => g.date === board.today);

  // Bucket the day groups by calendar month, in order.
  const monthsByKey = new Map<string, { key: string; groups: DayGroup[] }>();
  for (const group of upcoming) {
    const key = group.date.slice(0, 7);
    let bucket = monthsByKey.get(key);
    if (!bucket) {
      bucket = { key, groups: [] };
      monthsByKey.set(key, bucket);
    }
    bucket.groups.push(group);
  }
  // A month with only a budget (no payments, no expenses) still needs its
  // own bucket, so the budget's sticky line has a header to pin to — add an
  // empty one for any budget month within the loaded window that isn't
  // already covered by a day group.
  if (showBudgetsAndExpenses) {
    for (const b of budgets) {
      let monthCursor = startOfMonth(
        b.startDate < board.window.from ? board.window.from : b.startDate,
      );
      const lastMonth = startOfMonth(
        b.endDate > board.window.to ? board.window.to : b.endDate,
      );
      while (monthCursor <= lastMonth) {
        const key = monthCursor.slice(0, 7);
        if (!monthsByKey.has(key)) monthsByKey.set(key, { key, groups: [] });
        monthCursor = startOfMonth(addMonths(monthCursor, 1));
      }
    }
  }
  const todayMonth = board.today.slice(0, 7);
  // The current month always gets a section — even with nothing in it — so the
  // "Today" divider always has somewhere to land.
  if (
    todayMonth >= board.window.from.slice(0, 7) &&
    todayMonth <= board.window.to.slice(0, 7) &&
    !monthsByKey.has(todayMonth)
  ) {
    monthsByKey.set(todayMonth, { key: todayMonth, groups: [] });
  }
  const months = [...monthsByKey.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  const defaultKey =
    months.find((m) => m.key === todayMonth)?.key ?? months[0]?.key ?? '';

  // The active month follows the scroll: whichever month fills the most of the
  // viewport is highlighted (so scrolling up lights it as soon as it's in view,
  // not once its header reaches the top); the rest fade back.
  const [scrolledKey, setScrolledKey] = useState<string | null>(null);
  const monthKeys = months.map((m) => m.key).join(',');

  // Height of each sticky month header, so day headers can stick just below
  // it (nested sticky). Tracked with a ResizeObserver since it varies with
  // the income / progress / budget rows.
  const [monthHeaderH, setMonthHeaderH] = useState<Record<string, number>>({});
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setMonthHeaderH((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const key = el.dataset['monthKey'];
          if (!key) continue;
          // border-box height (offsetHeight) — `contentRect` omits the
          // header's padding, which left the day header ~12px too high and
          // tucked behind the month header's budget rows.
          const h = el.offsetHeight;
          if (next[key] !== h) {
            next[key] = h;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    for (const el of headerRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [monthKeys]);
  const activeKey =
    scrolledKey && months.some((m) => m.key === scrolledKey)
      ? scrolledKey
      : defaultKey;

  // Timeline rail bounds: the start of history through a little past the last
  // loaded month (or the furthest one, once there's nothing more to load).
  const loadedMonthKeys = new Set(months.map((m) => m.key));
  const minimapFrom = (
    startedFloor ?? `${months[0]?.key ?? todayMonth}-01`
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
  // How far below the viewport top a day section must land to clear BOTH the
  // sticky panel and the (also sticky) month header that pins beneath it —
  // otherwise the day's first rows sit hidden behind the month header.
  const dayScrollOffset = (dateOrKey: string) =>
    stickyTop + (monthHeaderH[dateOrKey.slice(0, 7)] ?? 0) + 8;

  // "Today" jumps to today's own day section, or the "Today" divider when the
  // day has nothing of its own — not just the top of the month. `smooth` is on
  // for a user tap; the on-load reposition passes `false` so the page just
  // opens at today without an animated scroll.
  const goToday = ({ smooth = true }: { smooth?: boolean } = {}) => {
    const el =
      document.querySelector<HTMLElement>(`[data-day="${board.today}"]`) ??
      document.querySelector<HTMLElement>('[data-plan-today]');
    if (el) {
      const y =
        window.scrollY +
        el.getBoundingClientRect().top -
        dayScrollOffset(board.today);
      window.scrollTo({
        top: Math.max(0, y),
        behavior: smooth ? 'smooth' : 'auto',
      });
      return;
    }
    jumpToMonth(todayMonth);
  };

  // Expose the jump so the mobile header's "Today" button can call it.
  useEffect(() => {
    if (!goTodayRef) return;
    goTodayRef.current = goToday;
    return () => {
      goTodayRef.current = null;
    };
  });

  // Which way the mobile "Today" FAB points: `up` when today has scrolled off
  // the top, `down` when it's still below the fold, `null` when it's on screen
  // (the FAB hides). Tracked off scroll so the arrow flips live.
  const [todayDir, setTodayDir] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const compute = () => {
      const el =
        document.querySelector<HTMLElement>(`[data-day="${board.today}"]`) ??
        document.querySelector<HTMLElement>('[data-plan-today]');
      if (el) {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.bottom <= stickyTop + 8) return setTodayDir('up');
        if (r.top >= vh - 8) return setTodayDir('down');
        return setTodayDir(null);
      }
      // Today's month isn't even rendered — point toward it by month order.
      const order = monthKeys ? monthKeys.split(',') : [];
      const first = order[0];
      const last = order[order.length - 1];
      if (!first || !last) return setTodayDir(null);
      if (todayMonth < first) return setTodayDir('up');
      if (todayMonth > last) return setTodayDir('down');
      return setTodayDir(null);
    };
    compute();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [board.today, todayMonth, stickyTop, monthKeys]);

  // Land on today every time the page opens — this component remounts on each
  // navigation to /plan, so a reader returning to Payments always finds the
  // list back at today rather than wherever they last scrolled to. Runs once
  // per mount, skips if the user has already scrolled (e.g. a browser back that
  // restored their position), and waits for today's month header to be measured
  // so the day doesn't land tucked behind the sticky panel.
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || stickyTop === 0) return;
    if (window.scrollY > 4) {
      didAutoScroll.current = true;
      return;
    }
    if (monthHeaderH[todayMonth] == null) return;
    didAutoScroll.current = true;
    goToday({ smooth: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; goToday is stable enough for this
  }, [stickyTop, monthKeys, monthHeaderH, todayMonth]);

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
        {showReview && reviewTransactions.length > 0 ? (
          <p className="rounded-lg border border-warn/40 bg-warn/[0.06] px-3 py-2 text-xs text-ink-soft">
            {reviewTransactions.length} imported transaction
            {reviewTransactions.length === 1 ? '' : 's'} to review — open{' '}
            <a href="/integrations" className="font-medium text-warn underline">
              Integrations
            </a>
            , or jump to their month.
          </p>
        ) : null}
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          {filterActive ? (
            filterLoading ? (
              <>
                <Spinner />
                Searching the next 12 months…
              </>
            ) : (
              'No payments match your filters in the next 12 months. Scroll to load more, or clear the filters.'
            )
          ) : (
            'Nothing scheduled in this window. Add a payment to get started.'
          )}
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
    <div className={cn('flex flex-col gap-8', showMinimap && 'sm:pr-16')}>
      {/* Mobile "jump to today" FAB — stacked just above the add-FAB. The
          arrow points the way you'd have to scroll to reach today. */}
      {todayDir ? (
        <button
          type="button"
          onClick={() => goToday()}
          aria-label="Jump to today"
          className="fixed bottom-[calc(8.25rem+env(safe-area-inset-bottom))] right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-2 pl-2.5 pr-3.5 text-xs font-semibold text-ink shadow-lg active:scale-95 sm:hidden"
        >
          {todayDir === 'up' ? (
            <ArrowUp size={15} strokeWidth={2.5} className="text-accent" />
          ) : (
            <ArrowDown size={15} strokeWidth={2.5} className="text-accent" />
          )}
          Today
        </button>
      ) : null}
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
        scrolledUp ? (
          <StartMarker />
        ) : null
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

      {reviewOutsideWindow > 0 ? (
        <p className="rounded-lg border border-warn/40 bg-warn/[0.06] px-3 py-2 text-xs text-ink-soft">
          {reviewOutsideWindow} more imported transaction
          {reviewOutsideWindow === 1 ? '' : 's'} to review fall outside these
          months — scroll to them, or open{' '}
          <a href="/integrations" className="font-medium text-warn underline">
            Integrations
          </a>
          .
        </p>
      ) : null}

      {months.map((mo) => {
        const isActive = mo.key === activeKey;
        const occs = mo.groups.flatMap((g) => g.occurrences);
        const monthStart = `${mo.key}-01`;
        const monthEnd = endOfMonth(monthStart);
        // Index in this month's days where the "Today" divider belongs (just
        // before the first day after today; `mo.groups.length` = after them
        // all). `-1` = not the current month, or today has its own section.
        const todayMarkerAt =
          mo.key === todayMonth && !todayHasOwnGroup
            ? (() => {
                const i = mo.groups.findIndex((g) => g.date > board.today);
                return i === -1 ? mo.groups.length : i;
              })()
            : -1;
        // A budget counts toward the month like a payment would (it's money
        // reserved); an unbudgeted expense counts too (money already spent).
        // A budgeted expense doesn't count separately — its budget already
        // does — it's shown but excluded here.
        const monthBudgets = showBudgetLines
          ? budgets.filter(
              (b) => b.startDate <= monthEnd && b.endDate >= monthStart,
            )
          : [];
        const monthUnbudgetedExpenses = showUnbudgeted
          ? expenses.filter(
              (e) =>
                e.date.slice(0, 7) === mo.key &&
                !e.budgetId &&
                matchesExpenseFilter(e),
            )
          : [];
        const unbudgetedExpensesMinor = sumInDisplay(
          monthUnbudgetedExpenses.map((e) => e.amount),
          displayCurrency,
          rates,
        );
        // An open budget reserves its whole limit; a closed one only commits
        // what it actually spent (the rest is released). `…Unspent` is what's
        // still sitting in the account, earmarked but not gone.
        const budgetReservedMinor = sumInDisplay(
          monthBudgets.map((b) =>
            b.closedAt ? money(b.spentMinor, b.limit.currency) : b.limit,
          ),
          displayCurrency,
          rates,
        );
        const budgetUnspentMinor = sumInDisplay(
          monthBudgets
            .filter((b) => !b.closedAt)
            .map((b) => money(b.remainingMinor, b.limit.currency)),
          displayCurrency,
          rates,
        );
        const {
          paidMinor,
          remainingMinor: paymentsRemainingMinor,
          totalMinor: paymentsTotalMinor,
        } = monthTotals(occs, displayCurrency, rates);
        // Payments due + unbudgeted expenses (spent outside any budget) — used
        // for the paid / still-due split and the per-day figures.
        const totalMinor = paymentsTotalMinor + unbudgetedExpensesMinor;
        const remainingMinor = paymentsRemainingMinor + unbudgetedExpensesMinor;
        const paidPct = totalMinor > 0 ? (paidMinor / totalMinor) * 100 : 0;
        // Everything committed this month, budget reserves included — the
        // headline "£X due", and what risk is judged against.
        const dueThisMonthMinor = totalMinor + budgetReservedMinor;

        const incomeMinor =
          board.incomeByMonth[mo.key] ?? board.defaultIncomeMinor;
        const isIncomeOverride = board.overriddenIncomeMonths.includes(mo.key);
        const hasIncome = incomeMinor > 0;
        // "Left" in two layers: `leftMinor` treats every budget's full reserve
        // as spent; `bankCashMinor` adds the unspent budget money back — it's
        // still in the account, so it's what your bank + cash should total.
        const leftMinor = incomeMinor - dueThisMonthMinor;
        const bankCashMinor = leftMinor + budgetUnspentMinor;
        const risk = riskFor(dueThisMonthMinor, incomeMinor);
        const spendPct = hasIncome
          ? (dueThisMonthMinor / incomeMinor) * 100
          : 0;

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
                {searchActive ? null : (
                  <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(money(dueThisMonthMinor, displayCurrency))}
                    <span className="ml-1 font-sans text-[11px] font-normal text-muted">
                      due
                    </span>
                  </span>
                )}
              </div>
              {searchActive ? null : hasIncome ? (
                <>
                  <Progress value={spendPct} indicatorClassName={risk.bar} />
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-medium tabular-nums',
                        risk.text,
                      )}
                    >
                      {leftMinor >= 0
                        ? `${formatMoney(money(leftMinor, displayCurrency))} left`
                        : `${formatMoney(
                            money(-leftMinor, displayCurrency),
                          )} over`}
                      <InfoHint label="What “left” means">
                        This should stay the same if all your spending is
                        planned or budgeted.
                      </InfoHint>
                    </span>
                    {budgetUnspentMinor > 0 ? (
                      <span className="text-muted">
                        (excluding{' '}
                        {formatMoney(
                          money(budgetUnspentMinor, displayCurrency),
                        )}{' '}
                        budgets)
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-muted">
                      · total{' '}
                      <span className="tabular-nums">
                        {formatMoney(money(bankCashMinor, displayCurrency))}
                      </span>
                      <InfoHint label="What “total” means">
                        This should be the sum of the money in your bank + cash.
                      </InfoHint>
                    </span>
                    {risk.label ? (
                      <span className={cn('font-medium', risk.text)}>
                        · {risk.label}
                      </span>
                    ) : null}
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
                  <button
                    type="button"
                    onClick={() => setEditingMonth(mo.key)}
                    className="inline-flex items-center gap-1.5 self-start text-xs text-muted hover:text-ink"
                  >
                    <Pencil size={11} className="opacity-70" />
                    Income {formatMoney(money(incomeMinor, displayCurrency))}
                    {isIncomeOverride ? (
                      <span className="text-muted"> · custom</span>
                    ) : null}
                  </button>
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
              {monthBudgets.length > 0 ? (
                <BudgetMonthGroup
                  budgets={monthBudgets}
                  displayCurrency={displayCurrency}
                  rates={rates}
                  onEdit={onEditBudget}
                />
              ) : null}
            </div>

            {todayMarkerAt === 0 ? (
              <TodayMarker label="Nothing due today" />
            ) : null}

            {mo.groups.map((group, gi) => {
              const isToday = group.date === board.today;
              const dayExpenses = showBudgetsAndExpenses
                ? (expensesByDate.get(group.date) ?? [])
                : [];
              const dayReview = reviewByDate.get(group.date) ?? [];

              // An in-between day emptied by the active filter — a thin,
              // non-interactive marker just to keep the timeline continuous.
              if (
                group.occurrences.length === 0 &&
                dayExpenses.length === 0 &&
                dayReview.length === 0
              ) {
                return (
                  <Fragment key={group.date}>
                    {todayMarkerAt === gi && gi > 0 ? (
                      <TodayMarker label="Nothing due today" />
                    ) : null}
                    <div
                      className="flex items-baseline justify-between border-b border-line/60 pb-1 text-xs text-muted/70"
                      data-day={group.date}
                    >
                      <span className="font-display font-medium">
                        {new Intl.DateTimeFormat('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        }).format(new Date(`${group.date}T00:00:00Z`))}
                      </span>
                      <span>no matches</span>
                    </div>
                  </Fragment>
                );
              }
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
              const dayNeedsReview = dayReview.length > 0;
              // Something on this day still needs the user to act.
              const dayActionable =
                dayNeedsReview || group.occurrences.some((o) => !isPaid(o));
              // "Done": everything that was on this day is handled — every
              // payment ticked and nothing left to review. (A day with only
              // expenses counts — they're records of money already spent.)
              const dayDone =
                !dayActionable &&
                group.occurrences.length + dayExpenses.length > 0;
              // While a filter is on, every day that still has rows is force-
              // expanded so matches in otherwise-collapsed/compact past days
              // are visible. `dayModes` state is untouched, so clearing the
              // filter drops each day straight back to its stored/default mode.
              const dayMode: DayMode = filterActive
                ? 'expanded'
                : dayModeFor(group.date, dayActionable);
              const dayCollapsed = dayMode === 'collapsed';
              const dayCompact = dayMode === 'compact';
              // Compact: only what still needs action — unpaid payments and
              // transactions to review. Paid payments + expenses are hidden.
              const shownOccurrences = dayCompact
                ? group.occurrences.filter((o) => !isPaid(o))
                : group.occurrences;
              const shownExpenses = dayCompact ? [] : dayExpenses;
              const hasVisibleRows =
                !dayCollapsed &&
                (shownOccurrences.length > 0 ||
                  shownExpenses.length > 0 ||
                  dayReview.length > 0);
              const dayItemCount =
                group.occurrences.length +
                dayExpenses.length +
                dayReview.length;
              const hiddenCount = dayCollapsed
                ? dayItemCount
                : group.occurrences.length -
                  shownOccurrences.length +
                  dayExpenses.length;
              const modeLabel =
                dayMode === 'collapsed'
                  ? dayActionable
                    ? 'Collapsed — click to show what needs action'
                    : 'Collapsed — click to expand'
                  : dayMode === 'compact'
                    ? 'Showing only what needs action — click to expand'
                    : 'Showing everything — click to collapse';
              return (
                <Fragment key={group.date}>
                  {todayMarkerAt === gi && gi > 0 ? (
                    <TodayMarker label="Nothing due today" />
                  ) : null}
                  <div className="flex flex-col gap-2" data-day={group.date}>
                    <div
                      style={{
                        top: stickyTop + (monthHeaderH[mo.key] ?? 0) - 2,
                      }}
                      className={cn(
                        'sticky z-10 flex items-baseline justify-between border-b bg-ground pb-1 pt-1.5',
                        isToday
                          ? 'border-accent/50'
                          : dayNeedsReview
                            ? 'border-warn/50'
                            : dayDone
                              ? 'border-good/30'
                              : 'border-line',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          !filterActive &&
                          cycleDayMode(group.date, dayActionable)
                        }
                        disabled={filterActive}
                        aria-expanded={dayMode !== 'collapsed'}
                        title={
                          filterActive
                            ? 'Showing matches — clear the filter to collapse'
                            : modeLabel
                        }
                        aria-label={`${new Intl.DateTimeFormat('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          timeZone: 'UTC',
                        }).format(
                          new Date(`${group.date}T00:00:00Z`),
                        )} — ${modeLabel}`}
                        className={cn(
                          'group -ml-1 flex items-center gap-1.5 rounded px-1 font-display text-sm font-semibold hover:bg-surface-2/60',
                          isToday
                            ? 'text-accent'
                            : dayNeedsReview
                              ? 'text-warn'
                              : dayDone
                                ? 'text-muted'
                                : 'text-ink',
                        )}
                      >
                        <ChevronDown
                          size={13}
                          strokeWidth={2.5}
                          className={cn(
                            'shrink-0 text-muted transition-transform',
                            dayCompact && '-rotate-45',
                            dayCollapsed && '-rotate-90',
                          )}
                        />
                        {isToday ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                            Today
                          </span>
                        ) : null}
                        {dayDone ? (
                          <span
                            className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good text-ground"
                            aria-label="All done"
                          >
                            <Check size={11} strokeWidth={3} />
                          </span>
                        ) : null}
                        {new Intl.DateTimeFormat('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        }).format(new Date(`${group.date}T00:00:00Z`))}
                        {dayNeedsReview ? (
                          <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                            {dayReview.length} to review
                          </span>
                        ) : null}
                        {(dayCollapsed || dayCompact) && hiddenCount > 0 ? (
                          <span className="text-[11px] font-medium text-muted">
                            {dayCollapsed
                              ? dayItemCount
                              : `+${hiddenCount} hidden`}
                          </span>
                        ) : null}
                      </button>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {!isToday &&
                        /^(Tomorrow|Yesterday|in \d|\d+ days ago)/.test(
                          group.relativeLabel,
                        ) ? (
                          <span className="hidden sm:inline">
                            {group.relativeLabel}
                          </span>
                        ) : null}
                        {showBudgetsAndExpenses ? (
                          <button
                            type="button"
                            onClick={() => onAddExpense(group.date)}
                            className="hidden font-medium text-ink-soft hover:text-ink hover:underline sm:inline"
                          >
                            + expense
                          </button>
                        ) : null}
                        {!searchActive && dayTotalMinor > 0 ? (
                          <span className="font-mono tabular-nums">
                            {formatMoney(money(dayTotalMinor, displayCurrency))}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {hasVisibleRows ? (
                      <div className="flex flex-col gap-1.5">
                        {[...shownOccurrences]
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
                                onDelete={onDelete}
                                onCreateAutomation={
                                  onCreateAutomation
                                    ? () =>
                                        onCreateAutomation(
                                          occ.name,
                                          occ.amount.minorUnits,
                                        )
                                    : undefined
                                }
                                highlight={highlightOccurrence?.(occ)}
                                onToggle={(paid) => setLocalPaid(occ.key, paid)}
                                displayCurrency={displayCurrency}
                                rates={rates}
                                today={board.today}
                                assign={assignChips}
                              />
                            </div>
                          ))}
                        {shownExpenses.map((e) => (
                          <ExpenseListItem
                            key={e.id}
                            expense={e}
                            highlight={highlightExpense?.(e.id)}
                            onEdit={() => onEditExpense(e)}
                            onDelete={
                              onDeleteExpense
                                ? () => onDeleteExpense(e)
                                : undefined
                            }
                            onCreateAutomation={
                              onCreateAutomation
                                ? () =>
                                    onCreateAutomation(
                                      e.name,
                                      e.amount.minorUnits,
                                    )
                                : undefined
                            }
                            assign={assignChips}
                          />
                        ))}
                        {dayReview.map((txn) => (
                          <BankTransactionRowComponent
                            key={txn.id}
                            txn={txn}
                            variant="day"
                            onLogExpense={() => onReviewExpense?.(txn)}
                            onCreatePayment={() => onReviewPayment?.(txn)}
                            onIgnore={() => onReviewIgnore?.(txn)}
                            onOpenDetails={
                              onReviewDetails
                                ? () => onReviewDetails(txn)
                                : undefined
                            }
                            onCreateAutomation={
                              onReviewCreateAutomation
                                ? () => onReviewCreateAutomation(txn)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}
            {todayMarkerAt === mo.groups.length && mo.groups.length > 0 ? (
              <TodayMarker label="Nothing due today" />
            ) : null}
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
