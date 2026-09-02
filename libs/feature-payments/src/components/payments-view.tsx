'use client';

import { useState } from 'react';
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
import { PaymentCalendar } from './payment-calendar';
import { PaymentForm } from './payment-form';
import { PaymentList } from './payment-list';
import {
  EMPTY_LIST_FILTER,
  ListFilters,
  type ListFilterValue,
} from './list-filters';
import { riskFor, sumInDisplay } from '../lib/risk';
import type { EditablePayment, PaymentBoard } from '../lib/types';

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
  view,
  month,
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

  const close = () => {
    setSheet({ mode: 'closed' });
    router.refresh();
  };

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
    view === 'calendar' ? startOfMonth(month) : startOfMonth(board.today);
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Upcoming payments</h1>
          <p className="mt-1 text-sm text-ink-soft">
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
              left of{' '}
              {formatMoney(money(scopeIncomeMinor, board.displayCurrency))}{' '}
              income · {scopeRisk.label}
            </p>
          ) : null}
        </div>
        <Button onClick={() => setSheet({ mode: 'new' })}>
          <Plus size={16} strokeWidth={3} />
          New payment
        </Button>
      </header>

      <div className="inline-flex w-fit items-center gap-1 rounded-md border border-line-strong bg-ground p-1">
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setParam('view', v)}
            className={cn(
              'rounded-sm px-3 py-1.5 text-[13px] font-medium capitalize transition-colors',
              view === v
                ? 'bg-surface-2 text-ink'
                : 'text-muted hover:text-ink',
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <div className="flex flex-col gap-5">
          <ListFilters
            value={listFilter}
            onChange={setListFilter}
            accounts={accounts}
            banks={banks}
            tags={tags}
          />
          <PaymentList
            board={board}
            filter={listFilter}
            onEdit={openEdit}
          />
        </div>
      ) : (
        <PaymentCalendar
          board={board}
          month={month}
          onMonthChange={(m) => setParam('month', m.slice(0, 7))}
          onEdit={openEdit}
        />
      )}

      {formModal}
    </div>
  );
}

export { startOfMonth };
