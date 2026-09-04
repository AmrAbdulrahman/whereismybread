'use client';

import { useEffect, useRef, useState } from 'react';
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
  formatConverted,
  formatMoney,
  money,
  startOfMonth,
  type IsoDate,
} from '@wib/domain';
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import { BudgetStrip } from './budget-strip';
import { FlagModal, type FlagTarget } from './flag-modal';
import { PaymentCalendar } from './payment-calendar';
import { PaymentForm } from './payment-form';
import { PaymentList } from './payment-list';
import {
  EMPTY_LIST_FILTER,
  ListFilters,
  type ListFilterValue,
} from './list-filters';
import { riskFor, sumInDisplay } from '../lib/risk';
import type { BudgetSummary, EditablePayment, PaymentBoard } from '../lib/types';

type View = 'list' | 'calendar';

/** Fold a per-occurrence override onto the payment's editable defaults. */
function applyOverride(
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
  const [listFilter, setListFilter] =
    useState<ListFilterValue>(EMPTY_LIST_FILTER);

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

  const { summary } = board;
  const usedCurrencies = [
    ...new Set([
      ...board.usedCurrencies,
      board.displayCurrency,
      defaultCurrency,
    ]),
  ];

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
  const scopeTotalMinor = inScope
    .filter((o) => o.amount.currency === summary.currency)
    .reduce((sum, o) => sum + o.amount.minorUnits, 0);
  const scopeIncomeMinor =
    board.incomeByMonth[scopeStart.slice(0, 7)] ?? board.defaultIncomeMinor;
  const scopeSpentDisplayMinor = sumInDisplay(
    inScope.map((o) => o.amount),
    board.displayCurrency,
    board.rates,
  );
  const scopeRisk = riskFor(scopeSpentDisplayMinor, scopeIncomeMinor);
  const isThisMonth = scopeStart === startOfMonth(board.today);
  const scopeBudgets = budgets.filter(
    (b) => b.startDate <= scopeEnd && b.endDate >= scopeStart,
  );
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

  if (!board.hasPayments) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        {scopeBudgets.length > 0 ? (
          <div className="w-full max-w-xs">
            <BudgetStrip budgets={scopeBudgets} />
          </div>
        ) : null}
        <h1 className="text-xl font-semibold">Nothing planned yet</h1>
        <p className="max-w-xs text-sm text-ink-soft">
          Add your first payment to see it on the calendar and in your upcoming
          list.
        </p>
        <Button size="lg" onClick={() => setSheet({ mode: 'new' })}>
          <Plus size={18} strokeWidth={3} />
          Add a payment
        </Button>
        {formModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        ref={panelRef}
        className="sticky top-0 z-30 -mx-4 flex flex-col gap-2.5 border-b border-line/60 bg-ground/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:gap-3 sm:px-6"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold sm:text-2xl">
              <span className="sm:hidden">Payments</span>
              <span className="hidden sm:inline">Upcoming payments</span>
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-soft sm:mt-1 sm:text-sm">
              {formatConverted(
                money(scopeTotalMinor, summary.currency),
                board.displayCurrency,
                board.rates,
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
                  money(
                    scopeIncomeMinor - scopeSpentDisplayMinor,
                    board.displayCurrency,
                  ),
                )}{' '}
                left
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
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button
              size="sm"
              className="sm:h-10 sm:px-4"
              onClick={() => setSheet({ mode: 'new' })}
            >
              <Plus size={16} strokeWidth={3} />
              New payment
            </Button>
            <div className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-ground p-1">
              {(['list', 'calendar'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeView(v)}
                  className={cn(
                    'rounded-sm px-3 py-1 text-[13px] font-medium capitalize transition-colors',
                    view === v
                      ? 'bg-surface-2 text-ink'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </header>

        {scopeBudgets.length > 0 ? (
          <BudgetStrip budgets={scopeBudgets} />
        ) : null}

        {view === 'list' ? (
          <ListFilters
            value={listFilter}
            onChange={setListFilter}
            accounts={accounts}
            banks={banks}
            tags={tags}
          />
        ) : null}
      </div>

      {view === 'list' ? (
        <PaymentList
          board={board}
          filter={listFilter}
          stickyTop={panelH}
          onEdit={openEdit}
          onFlag={openFlag}
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
      <FlagModal target={flagTarget} onDone={() => setFlagTarget(null)} />
    </div>
  );
}

export { startOfMonth };
