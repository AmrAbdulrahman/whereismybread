'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  Account,
  Bank,
  PaymentMethod,
  PaymentOverrides,
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
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { CalendarDays, List, Plus, SlidersHorizontal } from '@wib/ui/icons';
import { AddFab } from './add-fab';
import { BudgetForm, type BudgetFormInitial } from './budget-form';
import { ExpenseForm, type ExpenseFormInitial } from './expense-form';
import { FlagModal, type FlagTarget } from './flag-modal';
import { PaymentCalendar } from './payment-calendar';
import { PaymentForm } from './payment-form';
import { PaymentList } from './payment-list';
import {
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
import type { BankTransactionRow } from '../lib/bank-sync-queries';
import { riskFor, sumInDisplay } from '../lib/risk';
import type {
  BudgetSummary,
  EditablePayment,
  ExpenseLine,
  PaymentBoard,
} from '../lib/types';

type View = 'list' | 'calendar';

/** Fold a per-occurrence override onto the payment's editable defaults. */
export function applyOverride(
  base: EditablePayment,
  ov: PaymentOverrides,
): EditablePayment {
  return {
    ...base,
    name: ov.name ?? base.name,
    amount:
      ov.amountMinor != null ? (ov.amountMinor / 100).toFixed(2) : base.amount,
    defaultUnits:
      ov.units != null ? String(ov.units) : base.defaultUnits,
    lineItems:
      'lineItems' in ov && ov.lineItems
        ? ov.lineItems.map((li) => ({
            id: li.id,
            name: li.name,
            value: (li.valueMinor / 100).toFixed(2),
            currency: li.currency,
            iconKey: li.iconKey,
            logoUrl: li.logoUrl,
            color: li.color,
          }))
        : base.lineItems,
    currency: ov.currency ?? base.currency,
    methodId: 'methodId' in ov ? (ov.methodId ?? null) : base.methodId,
    accountId: 'accountId' in ov ? (ov.accountId ?? null) : base.accountId,
    bankId: 'bankId' in ov ? (ov.bankId ?? null) : base.bankId,
    recipientMethodId:
      'recipientMethodId' in ov
        ? (ov.recipientMethodId ?? null)
        : base.recipientMethodId,
    notes: 'notes' in ov ? (ov.notes ?? null) : base.notes,
  };
}

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
  };
}

function toExpenseFormInitial(e: ExpenseLine): ExpenseFormInitial {
  return {
    id: e.id,
    budgetId: e.budgetId,
    accountId: e.accountId,
    name: e.name,
    date: e.date,
    amountMinor: e.amount.minorUnits,
    currency: e.amount.currency,
    notes: e.notes,
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
  const filterBadge = listFilterBadgeCount(listFilter, unpaidOnly);

  // Per-day "needs review" transactions, with optimistic removal on triage.
  const [reviewSheet, setReviewSheet] = useState<TriageSheet>({ mode: 'closed' });
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
  const budgetCurrencyOptions = budgets.map((b) => ({
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
  // A budget's reserved amount counts toward the month like a payment would;
  // an expense tied to a budget doesn't count separately (its budget already
  // does) — only unbudgeted ones add on top, same as a one-time payment.
  const scopeUnbudgetedExpenses = expenses.filter(
    (e) => !e.budgetId && e.date >= scopeStart && e.date <= scopeEnd,
  );
  const scopeExtra = [
    ...scopeBudgets.map((b) => b.limit),
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
    scopeBudgets.map((b) => money(b.remainingMinor, b.limit.currency)),
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
          tags={tags}
          budgetId={
            expenseSheet.mode === 'new' ? expenseSheet.budgetId : null
          }
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
                {formatMoney(
                  money(scopeTotalLeftMinor, board.displayCurrency),
                )}{' '}
                left
                {scopeBudgets.length > 0 ? (
                  <span className="text-muted">
                    {' '}
                    (
                    {formatMoney(
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
            {view === 'list' ? (
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium',
                  filterBadge > 0 || filtersOpen
                    ? 'border-accent text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                <SlidersHorizontal size={15} />
                Filters
                {filterBadge > 0 ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                    {filterBadge}
                  </span>
                ) : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => changeView(view === 'list' ? 'calendar' : 'list')}
              aria-label={`Switch to ${view === 'list' ? 'calendar' : 'list'} view`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-medium text-muted hover:text-ink"
            >
              {view === 'list' ? (
                <CalendarDays size={15} />
              ) : (
                <List size={15} />
              )}
              {view === 'list' ? 'Calendar' : 'List'}
            </button>
          </div>
        </header>

        {view === 'list' && filtersOpen ? (
          <ListFilters
            value={listFilter}
            onChange={setListFilter}
            accounts={accounts}
            banks={banks}
            tags={tags}
            methods={methods}
            unpaidOnly={unpaidOnly}
            onUnpaidOnlyChange={setUnpaidOnly}
            onClose={() => setFiltersOpen(false)}
          />
        ) : null}
      </div>

      {view === 'list' ? (
        <PaymentList
          board={board}
          budgets={budgets}
          expenses={expenses}
          reviewTransactions={visibleReview}
          filter={listFilter}
          unpaidOnly={unpaidOnly}
          stickyTop={panelH}
          onEdit={openEdit}
          onFlag={openFlag}
          onEditBudget={(b) => setBudgetSheet({ mode: 'edit', budget: b })}
          onEditExpense={(e) => setExpenseSheet({ mode: 'edit', expense: e })}
          onAddExpense={(date) =>
            setExpenseSheet({ mode: 'new', date, budgetId: null })
          }
          onReviewExpense={(txn) => setReviewSheet({ mode: 'expense', txn })}
          onReviewPayment={(txn) => setReviewSheet({ mode: 'payment', txn })}
          onReviewIgnore={(txn) =>
            settleReview(txn.id, () => ignoreBankTransactionAction(txn.id))
          }
        />
      ) : (
        <PaymentCalendar
          board={board}
          month={calMonth}
          onMonthChange={changeMonth}
          onEdit={openEdit}
          onFlag={openFlag}
        />
      )}

      {formModal}
      {budgetModal}
      {expenseModal}
      <FlagModal target={flagTarget} onDone={() => setFlagTarget(null)} />

      <TransactionTriageModal
        sheet={reviewSheet}
        context={triageContext}
        budgets={budgets}
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
