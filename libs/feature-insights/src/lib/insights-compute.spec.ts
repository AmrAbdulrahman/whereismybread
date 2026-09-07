import { describe, expect, it } from 'vitest';
import { money } from '@wib/domain';
import type {
  BoardOccurrence,
  BudgetSummary,
  ExpenseLine,
  PaymentBoard,
} from '@wib/feature-payments';
import {
  annualOrOneTimeComingUp,
  annualRenewals,
  bigComingUp,
  flaggedOccurrences,
  nextMonthProjection,
  overBudget,
  relativeDay,
  unbudgetedThisMonth,
} from './insights-compute';

const RATES = { EUR: 1, GBP: 0.85 };
const TODAY = '2026-06-15';

function occ(o: Partial<BoardOccurrence>): BoardOccurrence {
  return {
    key: o.key ?? `${o.name}:${o.dueDate}`,
    paymentId: 'p',
    name: 'X',
    dueDate: TODAY,
    amount: money(1000, 'GBP'),
    feeMinor: 0,
    feeLabel: null,
    amountKind: 'fixed',
    unitName: null,
    units: null,
    rate: null,
    lineItems: null,
    attachments: [],
    recurrence: 'monthly',
    isOneTime: false,
    isSubscription: false,
    isException: false,
    url: null,
    logoUrl: null,
    brandColor: null,
    method: null,
    account: null,
    bank: null,
    recipientMethod: null,
    tags: [],
    status: 'scheduled',
    seriesFlagNote: null,
    instanceFlagNote: null,
    ...o,
  } as BoardOccurrence;
}

describe('relativeDay', () => {
  it('names the near future', () => {
    expect(relativeDay(TODAY, TODAY)).toBe('today');
    expect(relativeDay('2026-06-16', TODAY)).toBe('tomorrow');
    expect(relativeDay('2026-06-21', TODAY)).toBe('in 6 days');
    expect(relativeDay('2026-08-01', TODAY)).toBe('1 Aug');
  });
});

describe('bigComingUp', () => {
  const list = [
    occ({ name: 'Rent', dueDate: '2026-06-20', amount: money(90000, 'GBP') }),
    occ({ name: 'Coffee', dueDate: '2026-06-18', amount: money(400, 'GBP') }),
    occ({ name: 'Later', dueDate: '2026-07-30', amount: money(90000, 'GBP') }),
    occ({
      name: 'Skipped',
      dueDate: '2026-06-19',
      amount: money(90000, 'GBP'),
      status: 'skipped',
    }),
  ];

  it('keeps only ≥ £30 charges inside the 10-day window, soonest first', () => {
    const r = bigComingUp(list, TODAY, 'GBP', RATES);
    expect(r.map((i) => i.name)).toEqual(['Rent']);
  });

  it('uses the converted amount for the threshold', () => {
    // rates: 1 GBP per 0.85 EUR. €40.00 → £34.00 (over); €30.00 → £25.50 (under)
    const r = bigComingUp(
      [
        occ({ name: 'Big', dueDate: '2026-06-18', amount: money(4000, 'EUR') }),
        occ({ name: 'Small', dueDate: '2026-06-18', amount: money(3000, 'EUR') }),
      ],
      TODAY,
      'GBP',
      RATES,
    );
    expect(r.map((i) => i.name)).toEqual(['Big']);
  });
});

describe('annualOrOneTimeComingUp / annualRenewals', () => {
  const list = [
    occ({ name: 'Insurance', dueDate: '2026-08-01', recurrence: 'annual' }),
    occ({ name: 'Sofa', dueDate: '2026-09-01', recurrence: 'one_time', isOneTime: true }),
    occ({ name: 'Rent', dueDate: '2026-08-01', recurrence: 'monthly' }),
    occ({ name: 'FarOff', dueDate: '2027-02-01', recurrence: 'annual' }),
    occ({
      name: 'Domain',
      dueDate: '2026-07-10',
      recurrence: 'annual',
      isSubscription: true,
    }),
  ];

  it('takes annual + one-time within 4 months', () => {
    const r = annualOrOneTimeComingUp(list, TODAY, 'GBP', RATES);
    expect(r.map((i) => i.name)).toEqual(['Domain', 'Insurance', 'Sofa']);
  });

  it('renewals = annual subscriptions only', () => {
    const r = annualRenewals(list, TODAY, 'GBP', RATES);
    expect(r.map((i) => i.name)).toEqual(['Domain']);
    expect(r.at(0)?.href).toBe('/subscriptions');
  });
});

describe('flaggedOccurrences', () => {
  it('one row per flag, series note wins, skipped excluded', () => {
    const r = flaggedOccurrences(
      [
        occ({ name: 'A', dueDate: '2026-06-20', seriesFlagNote: 'check the rate' }),
        occ({ name: 'B', dueDate: '2026-06-22', instanceFlagNote: 'paid twice?' }),
        occ({ name: 'C', dueDate: '2026-06-25' }),
        occ({ name: 'D', dueDate: '2026-06-25', seriesFlagNote: 'x', status: 'skipped' }),
      ],
      TODAY,
    );
    expect(r.map((i) => i.name)).toEqual(['A', 'B']);
    expect(r.at(0)?.amountLabel).toBe('check the rate');
    expect(r.at(0)?.href).toContain('open=');
  });

  it('collapses a monthly series flag to its current-month occurrence', () => {
    const r = flaggedOccurrences(
      [
        occ({ paymentId: 'p1', name: 'Netflix', dueDate: '2026-07-05', seriesFlagNote: 'f' }),
        occ({ paymentId: 'p1', name: 'Netflix', dueDate: '2026-06-05', seriesFlagNote: 'f' }),
        occ({ paymentId: 'p1', name: 'Netflix', dueDate: '2026-08-05', seriesFlagNote: 'f' }),
      ],
      TODAY,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.href).toContain('on=2026-06-05');
  });
});

describe('overBudget', () => {
  function bud(b: Partial<BudgetSummary>): BudgetSummary {
    return {
      id: b.id ?? 'b',
      name: 'B',
      period: 'month',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      color: '#000',
      recurring: true,
      limit: money(10000, 'GBP'),
      spentMinor: 0,
      remainingMinor: 10000,
      progress: 0,
      expenses: [],
      ...b,
    } as BudgetSummary;
  }
  it('keeps ≥ 90% used, worst first', () => {
    const r = overBudget([
      bud({ id: '1', name: 'Fine', progress: 0.5, remainingMinor: 5000 }),
      bud({ id: '2', name: 'Tight', progress: 0.95, remainingMinor: 500 }),
      bud({ id: '3', name: 'Over', progress: 1.4, remainingMinor: -4000 }),
    ]);
    expect(r.map((i) => i.name)).toEqual(['Over', 'Tight']);
    expect(r.at(0)?.amountLabel).toContain('over by');
  });
});

describe('nextMonthProjection', () => {
  function board(b: Partial<PaymentBoard>): PaymentBoard {
    return {
      today: TODAY,
      displayCurrency: 'GBP',
      rates: RATES,
      occurrences: [],
      incomeByMonth: {},
      defaultIncomeMinor: 0,
      ...b,
    } as PaymentBoard;
  }
  it('is null when comfortably within income', () => {
    expect(
      nextMonthProjection(
        board({
          defaultIncomeMinor: 200000,
          occurrences: [occ({ dueDate: '2026-07-05', amount: money(50000, 'GBP') })],
        }),
      ),
    ).toBeNull();
  });
  it('flags an over-income month', () => {
    const r = nextMonthProjection(
      board({
        incomeByMonth: { '2026-07': 100000 },
        occurrences: [
          occ({ dueDate: '2026-07-05', amount: money(80000, 'GBP') }),
          occ({ dueDate: '2026-07-20', amount: money(40000, 'GBP') }),
        ],
      }),
    );
    expect(r?.overBy).toBeTruthy();
  });
});

describe('unbudgetedThisMonth', () => {
  function exp(e: Partial<ExpenseLine>): ExpenseLine {
    return {
      id: e.id ?? 'e',
      name: 'E',
      date: '2026-06-10',
      occurredAt: null,
      amount: money(1000, 'GBP'),
      notes: null,
      budgetId: null,
      budgetName: null,
      budgetColor: null,
      accountId: null,
      accountName: null,
      accountColor: null,
      bankId: null,
      bankName: null,
      bankColor: null,
      bankIconKey: null,
      bankLogoUrl: null,
      tags: [],
      attachments: [],
      ...e,
    } as ExpenseLine;
  }
  it('sums this-month, no-budget expenses and names the top account', () => {
    const r = unbudgetedThisMonth(
      [
        exp({ id: '1', amount: money(3000, 'GBP'), accountName: 'Groceries' }),
        exp({ id: '2', amount: money(1000, 'GBP'), accountName: 'Groceries' }),
        exp({ id: '3', amount: money(9999, 'GBP'), budgetId: 'b' }),
        exp({ id: '4', amount: money(9999, 'GBP'), date: '2026-05-30' }),
      ],
      TODAY,
      'GBP',
      RATES,
    );
    expect(r?.count).toBe(2);
    expect(r?.totalLabel).toContain('40');
    expect(r?.suggestion).toContain('Groceries');
  });
  it('is null with nothing unbudgeted', () => {
    expect(unbudgetedThisMonth([], TODAY, 'GBP', RATES)).toBeNull();
  });
});
