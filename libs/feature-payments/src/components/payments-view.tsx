'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  Account,
  Bank,
  PaymentMethod,
  RecipientMethod,
  Tag,
} from '@wib/db';
import {
  endOfMonth,
  formatMoney,
  money,
  startOfMonth,
  type IsoDate,
} from '@wib/domain';
import {
  Button,
  ResponsiveModal,
  cn,
  useMediaQuery,
  usePushRefresh,
  useToast,
} from '@wib/ui';
import { CalendarDays, List, Plus, SlidersHorizontal, X } from '@wib/ui/icons';
import {
  AutomationForm,
  type AutomationFormInitial,
  type AutomationLookups,
} from '@wib/feature-automations';
import { deletePaymentAction, type EditScope } from '../lib/actions';
import { deleteExpenseAction } from '../lib/budget-actions';
import {
  automationDraftFor,
  buildAutomationLookups,
} from '../lib/automation-lookups';
import { applyOverride } from '../lib/apply-override';
import { AddFab } from './add-fab';
import { BudgetForm, type BudgetFormInitial } from './budget-form';
import {
  DeleteConfirmModal,
  type DeleteTarget,
} from './delete-confirm-modal';
import { EnrichTransactionModal } from './enrich-transaction-modal';
import { ExpenseForm, type ExpenseFormInitial } from './expense-form';
import { FlagModal, type FlagTarget } from './flag-modal';
import { PaymentCalendar } from './payment-calendar';
import { PaymentForm } from './payment-form';
import { PaymentList } from './payment-list';
import { budgetAssignOptions } from './inline-assign-chip';
import { SyncButton } from './sync-button';
import {
  activeFilterChips,
  EMPTY_LIST_FILTER,
  ListFilters,
  listFilterBadgeCount,
  type ListFilterValue,
} from './list-filters';
import {
  TransactionTriageModal,
  type TriageSheet,
} from './transaction-triage-modal';
import {
  categorizeBankTransactionAction,
  ignoreBankTransactionAction,
} from '../lib/bank-transaction-actions';
import type { BankTransactionRow, SyncTarget } from '../lib/bank-sync-queries';
import { riskFor, sumInDisplay } from '../lib/risk';
import type {
  BudgetSummary,
  EditablePayment,
  ExpenseLine,
  PaymentBoard,
} from '../lib/types';

type View = 'list' | 'calendar';

function toBudgetFormInitial(b: BudgetSummary): BudgetFormInitial {
  return {
    id: b.id,
    name: b.name,
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    amountMinor: b.limit.minorUnits,
    currency: b.limit.currency,
    color: b.color,
    recurring: b.recurring,
    closedAt: b.closedAt,
  };
}

function toExpenseFormInitial(e: ExpenseLine): ExpenseFormInitial {
  return {
    id: e.id,
    budgetId: e.budgetId,
    accountId: e.accountId,
    bankId: e.bankId,
    name: e.name,
    date: e.date,
    amountMinor: e.amount.minorUnits,
    currency: e.amount.currency,
    notes: e.notes,
    url: e.url,
    logoUrl: e.logoUrl,
    brandColor: e.brandColor,
    tags: e.tags.map((t) => t.name),
    attachments: e.attachments,
  };
}

export function PaymentsView({
  board,
  methods,
  accounts,
  banks,
  recipientMethods,
  tags,
  defaultCurrency,
  view: viewProp,
  month,
  budgets = [],
  expenses = [],
  reviewTransactions = [],
  syncTargets = [],
}: {
  board: PaymentBoard;
  methods: PaymentMethod[];
  accounts: Account[];
  banks: Bank[];
  recipientMethods: RecipientMethod[];
  tags: Tag[];
  defaultCurrency: string;
  view: View;
  month: IsoDate;
  budgets?: BudgetSummary[];
  expenses?: ExpenseLine[];
  /** Uncategorized imported bank transactions, surfaced per-day in the list. */
  reviewTransactions?: BankTransactionRow[];
  /** Banks with a live integration — enables the toolbar sync button. */
  syncTargets?: SyncTarget[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [sheet, setSheet] = useState<
    | { mode: 'closed' }
    | { mode: 'new' }
    | {
        mode: 'edit';
        payment: EditablePayment;
        occurrenceDate?: string;
        hasOverride: boolean;
      }
  >({ mode: 'closed' });
  const [budgetSheet, setBudgetSheet] = useState<
    | { mode: 'closed' }
    | { mode: 'new' }
    | { mode: 'edit'; budget: BudgetSummary }
  >({ mode: 'closed' });
  const [expenseSheet, setExpenseSheet] = useState<
    | { mode: 'closed' }
    | { mode: 'new'; date: string; budgetId: string | null }
    | { mode: 'edit'; expense: ExpenseLine }
  >({ mode: 'closed' });
  const [listFilter, setListFilter] =
    useState<ListFilterValue>(EMPTY_LIST_FILTER);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const filterBadge = listFilterBadgeCount(listFilter, unpaidOnly, flaggedOnly);
  const filterChips = activeFilterChips(listFilter, unpaidOnly, flaggedOnly, {
    accounts,
    banks,
    tags,
    methods,
  });
  const clearAllFilters = () => {
    setListFilter(EMPTY_LIST_FILTER);
    setUnpaidOnly(false);
    setFlaggedOnly(false);
    setFiltersOpen(false);
    // The list was showing a filtered slice; drop the reader back at today
    // once it re-renders unfiltered.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => goTodayRef.current?.()),
    );
  };

  // Per-day "needs review" transactions, with optimistic removal on triage.
  const [reviewSheet, setReviewSheet] = useState<TriageSheet>({
    mode: 'closed',
  });
  const [reviewHandled, setReviewHandled] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [, startReviewTransition] = useTransition();
  useEffect(() => {
    setReviewHandled((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(reviewTransactions.map((t) => t.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [reviewTransactions]);
  const settleReview = (id: string, run: () => Promise<unknown>) => {
    setReviewHandled((prev) => new Set(prev).add(id));
    startReviewTransition(async () => {
      await run();
      router.refresh();
    });
  };
  const visibleReview = reviewTransactions.filter(
    (t) => !reviewHandled.has(t.id),
  );
  const triageContext = {
    methods,
    accounts,
    banks,
    recipientMethods,
    tags,
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Desktop: the filter panel expands inline under the header so the list keeps
  // updating live as you filter. Mobile: a bottom sheet (an inline panel would
  // pin to the top and its lower half couldn't be scrolled to).
  const filtersInline = useMediaQuery('(min-width: 1024px)');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // List ↔ calendar is a pure client switch — both views render from the same
  // already-loaded `board`, so there is nothing to fetch. The URL is kept in
  // sync (for refresh / share) without a server round trip.
  const [view, setView] = useState<View>(viewProp);
  useEffect(() => setView(viewProp), [viewProp]);
  const changeView = (v: View) => {
    setView(v);
    const next = new URLSearchParams(params);
    next.set('view', v);
    window.history.replaceState(null, '', `${pathname}?${next.toString()}`);
  };

  // The calendar's visible month. Paging within the already-loaded board window
  // is a local state change (instant); stepping outside it navigates so the
  // server widens the window. Re-syncs whenever the URL/server month changes.
  const [calMonth, setCalMonth] = useState<IsoDate>(month);
  useEffect(() => setCalMonth(month), [month]);

  const changeMonth = (m: IsoDate) => {
    setCalMonth(m);
    const inWindow =
      startOfMonth(m) >= startOfMonth(board.window.from) &&
      endOfMonth(m) <= board.window.to;
    if (inWindow) {
      // Keep the URL honest (refresh / share) without a server round trip.
      const next = new URLSearchParams(params);
      next.set('month', m.slice(0, 7));
      window.history.replaceState(null, '', `${pathname}?${next.toString()}`);
    } else {
      setParam('month', m.slice(0, 7));
    }
  };

  // The form's own mutation action calls `revalidatePath('/plan')`, which
  // re-renders this page — so closing the modal just needs to hide it.
  const close = () => setSheet({ mode: 'closed' });

  // The list fills this with its "scroll to today" jump (the timeline rail is
  // desktop-only, so mobile needs a button in the header instead).
  const goTodayRef = useRef<(() => void) | null>(null);

  // The top panel (summary + New payment + view switch + filters) is sticky.
  // Measure it so the list's month headers can stick just beneath it.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPanelH(el.offsetHeight));
    ro.observe(el);
    setPanelH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const openEdit = (paymentId: string, occurrenceDate?: string) => {
    const base = board.editable[paymentId];
    if (!base) return;
    const ov = occurrenceDate
      ? board.overrides[`${paymentId}:${occurrenceDate}`]
      : undefined;
    setSheet({
      mode: 'edit',
      payment: ov ? applyOverride(base, ov) : base,
      occurrenceDate,
      hasOverride: ov != null,
    });
  };

  // Deep link from Insights (or anywhere): `?open=<paymentId>&on=<YYYY-MM-DD>`
  // opens that payment's edit sheet, then strips the params so a refresh
  // doesn't reopen it. Best-effort scroll to the day underneath.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current) return;
    const openId = params.get('open');
    if (!openId) return;
    deepLinkDone.current = true;
    const on = params.get('on') ?? undefined;
    const base = board.editable[openId];
    if (base) {
      const ov = on ? board.overrides[`${openId}:${on}`] : undefined;
      setSheet({
        mode: 'edit',
        payment: ov ? applyOverride(base, ov) : base,
        occurrenceDate: on,
        hasOverride: ov != null,
      });
      if (on) {
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-day="${on}"]`)
            ?.scrollIntoView({ block: 'center' });
        });
      }
    }
    const next = new URLSearchParams(params);
    next.delete('open');
    next.delete('on');
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname, board.editable, board.overrides]);

  // Deep link from a push notification: `?focus=<paymentId>&on=<YYYY-MM-DD>`
  // scrolls to that occurrence and flashes its card (no modal), then strips
  // the params.
  const [highlight, setHighlight] = useState<{
    recordId: string;
    date: string | null;
  } | null>(null);
  const focusLinkDone = useRef(false);
  useEffect(() => {
    if (focusLinkDone.current) return;
    const focusId = params.get('focus');
    if (!focusId) return;
    focusLinkDone.current = true;
    const on = params.get('on');
    setHighlight({ recordId: focusId, date: on });
    if (on) {
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-day="${on}"]`)
          ?.scrollIntoView({ block: 'center' }),
      );
    }
    const clear = setTimeout(() => setHighlight(null), 3500);
    const next = new URLSearchParams(params);
    next.delete('focus');
    next.delete('on');
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    return () => clearTimeout(clear);
  }, [params, pathname]);

  const highlightOccurrence = (o: { paymentId: string; dueDate: string }) =>
    highlight != null &&
    o.paymentId === highlight.recordId &&
    (highlight.date == null || o.dueDate === highlight.date);
  const highlightExpense = (id: string) =>
    highlight != null && id === highlight.recordId;

  // "Create automation" from a card's ⋮ menu / a review row — opens the
  // automation dialog pre-filled to match that row (name + amount). All the
  // lookups the form needs are already on this page.
  const automationLookups: AutomationLookups = useMemo(
    () => buildAutomationLookups({ accounts, banks, methods, tags, budgets }),
    [accounts, banks, methods, tags, budgets],
  );

  const [automationDraft, setAutomationDraft] =
    useState<AutomationFormInitial | null>(null);
  const openCreateAutomation = (name: string, amountMinor: number) =>
    setAutomationDraft(automationDraftFor(name, amountMinor));

  // A push (bank sync finished, an automation fired) refreshes the board in
  // the background so the new payment / triaged transaction just appears.
  usePushRefresh(() => router.refresh());

  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const openDelete = (paymentId: string, occurrenceDate: string) => {
    const occ = board.occurrences.find(
      (o) => o.paymentId === paymentId && o.dueDate === occurrenceDate,
    );
    if (!occ) return;
    setDeleteTarget({
      kind: 'payment',
      paymentId,
      name: occ.name,
      recurring: !occ.isOneTime,
      occurrenceDate,
    });
  };

  // Deletes are optimistic: the row (or the row + every later occurrence)
  // vanishes the instant you confirm, the server call runs in the background,
  // and a failure puts it straight back with an error toast.
  type PendingDelete =
    | { kind: 'payment'; paymentId: string; scope: 'one' | 'from'; date: string }
    | { kind: 'expense'; id: string };
  const [pendingDeletes, setPendingDeletes] = useState<PendingDelete[]>([]);
  const [, startDeleteTransition] = useTransition();

  // Drop an optimistic entry once the refreshed server board no longer carries
  // anything it was hiding — i.e. the delete landed.
  useEffect(() => {
    setPendingDeletes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((d) => {
        if (d.kind === 'expense') return expenses.some((e) => e.id === d.id);
        // Keep hiding until the delete lands: for a single occurrence that's
        // when it's gone or turned `skipped` (a scoped delete on a series);
        // for "this + future" it's when nothing at/after the date remains.
        return board.occurrences.some((o) =>
          d.scope === 'one'
            ? o.paymentId === d.paymentId &&
              o.dueDate === d.date &&
              o.status !== 'skipped'
            : o.paymentId === d.paymentId && o.dueDate >= d.date,
        );
      });
      return next.length === prev.length ? prev : next;
    });
  }, [board, expenses]);

  const isExpenseHidden = (id: string) =>
    pendingDeletes.some((d) => d.kind === 'expense' && d.id === id);
  const isOccurrenceHidden = (o: { paymentId: string; dueDate: string }) =>
    pendingDeletes.some(
      (d) =>
        d.kind === 'payment' &&
        d.paymentId === o.paymentId &&
        (d.scope === 'one' ? d.date === o.dueDate : o.dueDate >= d.date),
    );

  const confirmDelete = (target: DeleteTarget, scope: EditScope | null) => {
    setDeleteTarget(null);
    const entry: PendingDelete =
      target.kind === 'expense'
        ? { kind: 'expense', id: target.id }
        : {
            kind: 'payment',
            paymentId: target.paymentId,
            scope: scope === 'future' ? 'from' : 'one',
            date: target.occurrenceDate,
          };
    setPendingDeletes((prev) => [...prev, entry]);

    startDeleteTransition(async () => {
      const res =
        target.kind === 'expense'
          ? await deleteExpenseAction(target.id)
          : await deletePaymentAction(
              target.paymentId,
              scope
                ? { scope, occurrenceDate: target.occurrenceDate }
                : undefined,
            );
      if (res.ok) {
        router.refresh();
      } else {
        setPendingDeletes((prev) => prev.filter((d) => d !== entry));
        toast({
          title: `Couldn’t delete ${target.name}`,
          description: res.error ?? 'It has been put back — please try again.',
          tone: 'danger',
        });
      }
    });
  };

  // Clicking a per-day "needs review" row opens its details (same modal as the
  // inbox's "Edit details").
  const [reviewDetailsId, setReviewDetailsId] = useState<string | null>(null);
  const reviewDetailsTxn =
    reviewTransactions.find((t) => t.id === reviewDetailsId) ?? null;

  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);
  const openFlag = (paymentId: string, occurrenceDate: string) => {
    const occ = board.occurrences.find(
      (o) => o.paymentId === paymentId && o.dueDate === occurrenceDate,
    );
    if (!occ) return;
    setFlagTarget({
      paymentId,
      name: occ.name,
      occurrenceDate,
      recurring: !occ.isOneTime,
      seriesNote: occ.seriesFlagNote,
      instanceNote: occ.instanceFlagNote,
    });
  };

  const usedCurrencies = [
    ...new Set([
      ...board.usedCurrencies,
      board.displayCurrency,
      defaultCurrency,
    ]),
  ];
  // Only open budgets can take a new expense; when editing an expense already
  // tied to a closed budget, keep that one in the list so it stays selected.
  const activeExpenseBudgetId =
    expenseSheet.mode === 'edit' ? expenseSheet.expense.budgetId : null;
  const budgetCurrencyOptions = budgets
    .filter((b) => !b.closedAt || b.id === activeExpenseBudgetId)
    .map((b) => ({
      id: b.id,
      name: b.name,
      currency: b.limit.currency,
      startDate: b.startDate,
    }));

  // Header stats follow whatever month the calendar is showing; the list has
  // no single month, so it stays on the current one.
  const scopeStart =
    view === 'calendar' ? startOfMonth(calMonth) : startOfMonth(board.today);
  const scopeEnd = endOfMonth(scopeStart);
  const inScope = board.occurrences.filter(
    (o) =>
      o.status !== 'skipped' &&
      o.dueDate >= scopeStart &&
      o.dueDate <= scopeEnd,
  );
  const scopeBudgets = budgets.filter(
    (b) => b.startDate <= scopeEnd && b.endDate >= scopeStart,
  );
  const scopeOpenBudgets = scopeBudgets.filter((b) => !b.closedAt);
  const scopeClosedBudgets = scopeBudgets.filter((b) => b.closedAt);
  // An open budget's whole reserved amount counts toward the month like a
  // payment would. A closed budget only commits what it actually spent — its
  // unspent remainder is released back into "left". An expense tied to a
  // budget doesn't count separately (its budget already does) — only
  // unbudgeted ones add on top, same as a one-time payment.
  const scopeUnbudgetedExpenses = expenses.filter(
    (e) => !e.budgetId && e.date >= scopeStart && e.date <= scopeEnd,
  );
  const scopeExtra = [
    ...scopeOpenBudgets.map((b) => b.limit),
    ...scopeClosedBudgets.map((b) => money(b.spentMinor, b.limit.currency)),
    ...scopeUnbudgetedExpenses.map((e) => e.amount),
  ];
  const scopeIncomeMinor =
    board.incomeByMonth[scopeStart.slice(0, 7)] ?? board.defaultIncomeMinor;
  // Everything committed this month — payments due, budgets reserved,
  // unbudgeted expenses already spent — converted into one currency. Powers
  // both the "due this month" headline and the risk line below it.
  const scopeSpentDisplayMinor = sumInDisplay(
    [...inScope.map((o) => o.amount), ...scopeExtra],
    board.displayCurrency,
    board.rates,
  );
  const scopeRisk = riskFor(scopeSpentDisplayMinor, scopeIncomeMinor);
  // "Left" comes in two layers: the conservative figure treats every budget's
  // full reserved amount as already spent; the (larger, friendlier) headline
  // adds back whatever's still unspent in those budgets — money that's set
  // aside, but not gone yet.
  const scopeLeftMinor = scopeIncomeMinor - scopeSpentDisplayMinor;
  const scopeBudgetsRemainingMinor = sumInDisplay(
    scopeOpenBudgets.map((b) => money(b.remainingMinor, b.limit.currency)),
    board.displayCurrency,
    board.rates,
  );
  const scopeTotalLeftMinor = scopeLeftMinor + scopeBudgetsRemainingMinor;
  const isThisMonth = scopeStart === startOfMonth(board.today);
  const scopeMonthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    ...(scopeStart.slice(0, 4) === board.today.slice(0, 4)
      ? {}
      : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(`${scopeStart}T00:00:00Z`));

  const formModal = (
    <ResponsiveModal
      open={sheet.mode !== 'closed'}
      onOpenChange={(o) => !o && close()}
      title={sheet.mode === 'edit' ? 'Edit payment' : 'New payment'}
    >
      {sheet.mode !== 'closed' ? (
        <PaymentForm
          methods={methods}
          accounts={accounts}
          banks={banks}
          recipientMethods={recipientMethods}
          tags={tags}
          budgets={budgetAssignOptions(budgets)}
          defaultCurrency={defaultCurrency}
          today={board.today}
          usedCurrencies={usedCurrencies}
          rates={board.rates}
          initial={sheet.mode === 'edit' ? sheet.payment : undefined}
          occurrenceDate={
            sheet.mode === 'edit' ? sheet.occurrenceDate : undefined
          }
          hasOverride={sheet.mode === 'edit' && sheet.hasOverride}
          onDone={close}
        />
      ) : null}
    </ResponsiveModal>
  );

  const budgetModal = (
    <ResponsiveModal
      open={budgetSheet.mode !== 'closed'}
      onOpenChange={(o) => !o && setBudgetSheet({ mode: 'closed' })}
      title={budgetSheet.mode === 'edit' ? 'Edit budget' : 'New budget'}
    >
      {budgetSheet.mode !== 'closed' ? (
        <BudgetForm
          // Defaults the month picker to whichever month is currently in
          // view, not necessarily today.
          today={scopeStart}
          initial={
            budgetSheet.mode === 'edit'
              ? toBudgetFormInitial(budgetSheet.budget)
              : undefined
          }
          defaultCurrency={defaultCurrency}
          usedCurrencies={usedCurrencies}
          onDone={() => setBudgetSheet({ mode: 'closed' })}
          onCancel={() => setBudgetSheet({ mode: 'closed' })}
        />
      ) : null}
    </ResponsiveModal>
  );

  const filterControls = (
    <ListFilters
      value={listFilter}
      onChange={setListFilter}
      accounts={accounts}
      banks={banks}
      tags={tags}
      methods={methods}
      unpaidOnly={unpaidOnly}
      onUnpaidOnlyChange={setUnpaidOnly}
      flaggedOnly={flaggedOnly}
      onFlaggedOnlyChange={setFlaggedOnly}
      onClearAll={clearAllFilters}
    />
  );

  const filtersModal = filtersInline ? null : (
    <ResponsiveModal
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
      title="Filters"
    >
      {filterControls}
    </ResponsiveModal>
  );

  const expenseModal = (
    <ResponsiveModal
      open={expenseSheet.mode !== 'closed'}
      onOpenChange={(o) => !o && setExpenseSheet({ mode: 'closed' })}
      title={expenseSheet.mode === 'edit' ? 'Edit expense' : 'New expense'}
    >
      {expenseSheet.mode !== 'closed' ? (
        <ExpenseForm
          budgets={budgetCurrencyOptions}
          accounts={accounts}
          banks={banks}
          tags={tags}
          budgetId={expenseSheet.mode === 'new' ? expenseSheet.budgetId : null}
          date={
            expenseSheet.mode === 'new'
              ? expenseSheet.date
              : expenseSheet.expense.date
          }
          initial={
            expenseSheet.mode === 'edit'
              ? toExpenseFormInitial(expenseSheet.expense)
              : undefined
          }
          usedCurrencies={usedCurrencies}
          onDone={() => setExpenseSheet({ mode: 'closed' })}
          onDeleted={() => setExpenseSheet({ mode: 'closed' })}
          onCancel={() => setExpenseSheet({ mode: 'closed' })}
        />
      ) : null}
    </ResponsiveModal>
  );

  if (
    !board.hasPayments &&
    budgets.length === 0 &&
    expenses.length === 0 &&
    reviewTransactions.length === 0
  ) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Nothing planned yet</h1>
        <p className="max-w-xs text-sm text-ink-soft">
          Add your first payment to see it on the calendar and in your upcoming
          list.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="lg" onClick={() => setSheet({ mode: 'new' })}>
            <Plus size={18} strokeWidth={3} />
            Add a payment
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setBudgetSheet({ mode: 'new' })}
          >
            <Plus size={18} strokeWidth={3} />
            Add a budget
          </Button>
        </div>
        {formModal}
        {budgetModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        ref={panelRef}
        className="sticky top-0 z-30 -mx-4 flex flex-col gap-2.5 border-b border-line/60 bg-ground/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:gap-3 sm:px-6 sm:pt-4 lg:pr-20"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold sm:text-2xl">
              <span className="sm:hidden">Payments</span>
              <span className="hidden sm:inline">Upcoming payments</span>
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-soft sm:mt-1 sm:text-sm">
              {formatMoney(
                money(scopeSpentDisplayMinor, board.displayCurrency),
              )}{' '}
              due {isThisMonth ? 'this month' : `in ${scopeMonthLabel}`}
              {' · '}
              {inScope.length} scheduled
            </p>
            {scopeRisk.level !== 'none' ? (
              <p
                className={cn(
                  'mt-1 flex items-center gap-1.5 text-xs font-medium',
                  scopeRisk.text,
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', scopeRisk.bar)}
                />
                {formatMoney(money(scopeTotalLeftMinor, board.displayCurrency))}{' '}
                left
                {scopeOpenBudgets.length > 0 ? (
                  <span className="font-normal text-muted"> after budgets</span>
                ) : null}
                {scopeOpenBudgets.length > 0 ? (
                  <span className="text-muted">
                    {' '}
                    ({formatMoney(
                      money(scopeLeftMinor, board.displayCurrency),
                    )}{' '}
                    left +{' '}
                    {formatMoney(
                      money(scopeBudgetsRemainingMinor, board.displayCurrency),
                    )}{' '}
                    budgets)
                  </span>
                ) : null}
                <span className="hidden sm:inline">
                  {' '}
                  of{' '}
                  {formatMoney(
                    money(scopeIncomeMinor, board.displayCurrency),
                  )}{' '}
                  income
                </span>{' '}
                · {scopeRisk.label}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Mobile "Today" lives in a FAB now (see PaymentList). */}
            <SyncButton targets={syncTargets} />
            <button
              type="button"
              onClick={() => changeView(view === 'list' ? 'calendar' : 'list')}
              aria-label={`Switch to ${view === 'list' ? 'calendar' : 'list'} view`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] font-medium text-muted hover:text-ink sm:px-3"
            >
              {view === 'list' ? (
                <CalendarDays size={15} />
              ) : (
                <List size={15} />
              )}
              <span className="hidden sm:inline">
                {view === 'list' ? 'Calendar' : 'List'}
              </span>
            </button>
            {view === 'list' ? (
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                aria-label="Filters"
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium sm:px-3',
                  filterBadge > 0 || filtersOpen
                    ? 'border-accent text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                <SlidersHorizontal size={15} />
                <span className="hidden sm:inline">Filters</span>
                {filterBadge > 0 ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                    {filterBadge}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </header>

        {view === 'list' && filtersInline && filtersOpen ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-surface p-3">
            {filterControls}
          </div>
        ) : null}

        {view === 'list' && filterChips.length > 0 ? (
          <div className="-mb-1 flex items-center gap-1.5 overflow-x-auto pb-1">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setListFilter(chip.next);
                  if (chip.clearsUnpaidOnly) setUnpaidOnly(false);
                  if (chip.clearsFlaggedOnly) setFlaggedOnly(false);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent bg-accent/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-accent"
              >
                <span className="max-w-[10rem] truncate">{chip.label}</span>
                <X size={12} strokeWidth={2.5} />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="shrink-0 whitespace-nowrap px-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      {view === 'list' ? (
        <PaymentList
          board={board}
          budgets={budgets}
          accounts={accounts}
          tags={tags}
          expenses={expenses.filter((e) => !isExpenseHidden(e.id))}
          reviewTransactions={visibleReview}
          filter={listFilter}
          unpaidOnly={unpaidOnly}
          flaggedOnly={flaggedOnly}
          stickyTop={panelH}
          goTodayRef={goTodayRef}
          hideOccurrence={isOccurrenceHidden}
          highlightOccurrence={highlightOccurrence}
          highlightExpense={highlightExpense}
          onEdit={openEdit}
          onFlag={openFlag}
          onDelete={openDelete}
          onEditBudget={(b) => setBudgetSheet({ mode: 'edit', budget: b })}
          onEditExpense={(e) => setExpenseSheet({ mode: 'edit', expense: e })}
          onDeleteExpense={(e) =>
            setDeleteTarget({ kind: 'expense', id: e.id, name: e.name })
          }
          onCreateAutomation={openCreateAutomation}
          onAddExpense={(date) =>
            setExpenseSheet({ mode: 'new', date, budgetId: null })
          }
          onReviewExpense={(txn) => setReviewSheet({ mode: 'expense', txn })}
          onReviewPayment={(txn) => setReviewSheet({ mode: 'payment', txn })}
          onReviewIgnore={(txn) =>
            settleReview(txn.id, () => ignoreBankTransactionAction(txn.id))
          }
          onReviewDetails={(txn) => setReviewDetailsId(txn.id)}
          onReviewCreateAutomation={(txn) =>
            openCreateAutomation(
              txn.displayName || txn.merchant || txn.description,
              txn.amountMinor,
            )
          }
        />
      ) : (
        <PaymentCalendar
          board={board}
          month={calMonth}
          onMonthChange={changeMonth}
          hideOccurrence={isOccurrenceHidden}
          highlightOccurrence={highlightOccurrence}
          onEdit={openEdit}
          onFlag={openFlag}
          onDelete={openDelete}
        />
      )}

      {formModal}
      {budgetModal}
      {expenseModal}
      {filtersModal}
      <FlagModal target={flagTarget} onDone={() => setFlagTarget(null)} />

      <DeleteConfirmModal
        target={deleteTarget}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <EnrichTransactionModal
        open={reviewDetailsTxn != null}
        onOpenChange={(o) => !o && setReviewDetailsId(null)}
        txn={reviewDetailsTxn}
        accounts={accounts}
        methods={methods}
        tags={tags}
        onDone={() => {
          setReviewDetailsId(null);
          router.refresh();
        }}
      />

      <ResponsiveModal
        open={automationDraft != null}
        onOpenChange={(o) => !o && setAutomationDraft(null)}
        title="New automation"
      >
        {automationDraft ? (
          <AutomationForm
            initial={automationDraft}
            lookups={automationLookups}
            hideTrigger
            onDone={() => {
              setAutomationDraft(null);
              router.refresh();
            }}
            onCancel={() => setAutomationDraft(null)}
          />
        ) : null}
      </ResponsiveModal>

      <TransactionTriageModal
        sheet={reviewSheet}
        context={triageContext}
        budgets={budgets.filter((b) => !b.closedAt)}
        today={board.today}
        defaultCurrency={defaultCurrency}
        rates={board.rates}
        onClose={() => setReviewSheet({ mode: 'closed' })}
        onExpenseDone={(txnId, expense) => {
          setReviewSheet({ mode: 'closed' });
          settleReview(txnId, () =>
            categorizeBankTransactionAction(txnId, {
              type: 'expense',
              id: expense.id,
            }),
          );
        }}
        onPaymentDone={(txnId, payment) => {
          setReviewSheet({ mode: 'closed' });
          if (payment) {
            settleReview(txnId, () =>
              categorizeBankTransactionAction(txnId, {
                type: 'payment',
                id: payment.id,
              }),
            );
          }
        }}
      />

      <AddFab
        onAddPayment={() => setSheet({ mode: 'new' })}
        onAddExpense={() =>
          setExpenseSheet({ mode: 'new', date: board.today, budgetId: null })
        }
        onAddBudget={() => setBudgetSheet({ mode: 'new' })}
      />
    </div>
  );
}

export { startOfMonth };
