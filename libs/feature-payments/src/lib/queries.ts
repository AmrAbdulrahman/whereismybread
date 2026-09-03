import {
  ensureDefaultMethods,
  getBoardBundle,
  getRates,
  listAccountsWithUsage,
  listBanksWithUsage,
  listPaymentMethods,
  type Account,
  type AccountWithUsage,
  type Bank,
  type BankWithUsage,
  type BoardBundle,
  type PaymentMethod,
  type PaymentOverrides,
  type RecipientMethod,
  type Tag,
} from '@wib/db';
import {
  addMonths,
  convertMoney,
  daysBetween,
  endOfMonth,
  expandOccurrences,
  money,
  startOfMonth,
  todayIn,
  type IsoDate,
  type RateMap,
} from '@wib/domain';
import {
  requireUser,
  requireUserId,
  type SessionUser,
} from '@wib/auth/server';
import { feeMinor, type FeeKind } from './fees';
import type {
  BoardOccurrence,
  DayGroup,
  EditablePayment,
  OccurrenceLineItem,
  PaymentBoard,
} from './types';

function relativeLabel(today: IsoDate, date: IsoDate): string {
  const delta = daysBetween(today, date);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta > 1 && delta <= 14) return `in ${delta} days`;
  if (delta === -1) return 'Yesterday';
  if (delta < 0) return `${-delta} days ago`;
  const d = new Date(`${date}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  };
  if (date.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(
    d,
  );
}

export interface PaymentsContext {
  methods: PaymentMethod[];
  accounts: Account[];
  banks: Bank[];
  recipientMethods: RecipientMethod[];
  tags: Tag[];
}

/**
 * The board and its lookup lists in a **single** DB round trip (+ a memoised
 * rates read). Replaces the old `getPaymentsContext()` + `getPaymentBoard()`
 * pair, which together fired ~11 queries.
 */
export async function getBoardData(opts?: {
  from?: IsoDate;
  to?: IsoDate;
  /** First of the calendar month in view; widens the window to cover it. */
  month?: IsoDate;
}): Promise<{ context: PaymentsContext; board: PaymentBoard }> {
  const user = await requireUser();
  const today = todayIn(user.timezone);

  // One window that covers the upcoming list and the visible calendar month.
  const month = opts?.month ?? startOfMonth(today);
  const from =
    opts?.from ??
    (month < startOfMonth(today) ? startOfMonth(month) : startOfMonth(today));
  const farByMonth = endOfMonth(addMonths(month, 1));
  const farByToday = endOfMonth(addMonths(today, 3));
  const to = opts?.to ?? (farByMonth > farByToday ? farByMonth : farByToday);

  let bundle = await getBoardBundle(user.id, {
    from,
    to,
    monthFrom: from.slice(0, 7),
    monthTo: to.slice(0, 7),
  });

  // Brand-new account → seed the four default methods, then re-read just those.
  if (bundle.methods.length === 0) {
    await ensureDefaultMethods(user.id);
    bundle = { ...bundle, methods: await listPaymentMethods(user.id) };
  }

  const rates = await getRates();
  const board = buildBoard({ user, today, from, to, bundle, rates });
  const context: PaymentsContext = {
    methods: bundle.methods,
    accounts: bundle.accounts,
    banks: bundle.banks,
    recipientMethods: bundle.recipientMethods,
    tags: bundle.tags,
  };
  return { context, board };
}

/** Every account the signed-in user owns, with per-account payment counts. */
export async function getAccounts(): Promise<AccountWithUsage[]> {
  return listAccountsWithUsage(await requireUserId());
}

/** Every bank the signed-in user owns, with per-bank payment counts. */
export async function getBanks(): Promise<BankWithUsage[]> {
  return listBanksWithUsage(await requireUserId());
}

/** Assemble a `PaymentBoard` from an already-loaded bundle — pure, no I/O. */
function buildBoard({
  user,
  today,
  from,
  to,
  bundle,
  rates,
}: {
  user: SessionUser;
  today: IsoDate;
  from: IsoDate;
  to: IsoDate;
  bundle: BoardBundle;
  rates: RateMap;
}): PaymentBoard {
  const { methods, accounts, banks, recipientMethods, payments } = bundle;
  const events = bundle.events;
  const incomeRows = bundle.incomes;

  const methodById = new Map(methods.map((m) => [m.id, m]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const recipientMethodById = new Map(recipientMethods.map((r) => [r.id, r]));
  const eventByKey = new Map(
    events.map((e) => [`${e.paymentId}:${e.dueDate}`, e]),
  );

  const overridesByKey: Record<string, PaymentOverrides> = {};

  /** Resolve a value that the override may set (including to `null`). */
  const pick = <K extends keyof PaymentOverrides>(
    ov: PaymentOverrides | null,
    key: K,
    base: NonNullable<PaymentOverrides[K]> | null,
  ): NonNullable<PaymentOverrides[K]> | null =>
    ov && key in ov ? (ov[key] ?? null) : base;

  const occurrences: BoardOccurrence[] = [];
  for (const p of payments) {
    const spec = {
      recurrence: p.recurrence,
      anchorDate: p.anchorDate,
      dayOfMonth: p.dayOfMonth,
      endsOn: p.endsOn,
    };
    for (const occ of expandOccurrences(spec, { from, to })) {
      const key = `${p.id}:${occ.dueDate}`;
      const ev = eventByKey.get(key);
      const ov = ev?.overrides ?? null;
      if (ov) overridesByKey[key] = ov;

      const methodId = pick(ov, 'methodId', p.methodId);
      const accountId = pick(ov, 'accountId', p.accountId);
      const bankId = pick(ov, 'bankId', p.bankId);
      const recipientMethodId = pick(
        ov,
        'recipientMethodId',
        p.recipientMethodId,
      );
      const method = methodId ? (methodById.get(methodId) ?? null) : null;
      const account = accountId ? (accountById.get(accountId) ?? null) : null;
      const bank = bankId ? (bankById.get(bankId) ?? null) : null;
      const recipientMethod = recipientMethodId
        ? (recipientMethodById.get(recipientMethodId) ?? null)
        : null;

      const occCurrency = ov?.currency ?? p.currency;
      const isPerUnit = p.amountKind === 'per_unit';
      const isGroup = p.amountKind === 'group';
      const rateMinor = ov?.amountMinor ?? p.amountMinor;
      const units = isPerUnit ? (ov?.units ?? p.defaultUnits) : 1;

      // Group: the charge is the sum of every record, converted into the
      // occurrence currency at current rates (an unconvertible record — no
      // rate — is left out, matching the day-total rule). A month's override
      // can swap the whole record list.
      const rawItems = isGroup ? (ov?.lineItems ?? p.lineItems ?? []) : [];
      const lineItems: OccurrenceLineItem[] = rawItems.map((li) => ({
        id: li.id,
        name: li.name,
        amount: money(li.valueMinor, li.currency),
        iconKey: li.iconKey,
        logoUrl: li.logoUrl,
        color: li.color,
      }));
      const groupMinor = lineItems.reduce((sum, li) => {
        const c = convertMoney(li.amount, occCurrency, rates);
        return c.currency === occCurrency.toUpperCase()
          ? sum + c.minorUnits
          : sum;
      }, 0);

      const baseMinor = isGroup
        ? groupMinor
        : isPerUnit
          ? Math.round(rateMinor * units)
          : rateMinor;
      const feeKind = (p.feeKind ?? 'none') as FeeKind;
      const feePortionMinor = feeMinor(
        baseMinor,
        feeKind,
        p.feeFixedMinor,
        p.feePercent,
      );

      occurrences.push({
        key,
        paymentId: p.id,
        name: ov?.name ?? p.name,
        dueDate: occ.dueDate,
        amount: money(baseMinor + feePortionMinor, occCurrency),
        feeMinor: feePortionMinor,
        feeLabel: feeKind === 'percent' ? `+${p.feePercent}%` : null,
        amountKind: isGroup ? 'group' : isPerUnit ? 'per_unit' : 'fixed',
        unitName: isPerUnit ? p.unitName : null,
        units: isPerUnit ? units : null,
        rate: isPerUnit
          ? money(rateMinor, ov?.currency ?? p.currency)
          : null,
        lineItems: isGroup ? lineItems : null,
        attachments: p.attachments ?? [],
        recurrence: p.recurrence,
        isOneTime: p.recurrence === 'one_time',
        isSubscription: p.isSubscription,
        isException: ov != null,
        url: p.url,
        logoUrl: p.logoUrl,
        brandColor: p.brandColor,
        method: method
          ? {
              id: method.id,
              name: method.name,
              kind: method.kind,
              iconKey: method.iconKey,
              logoUrl: method.logoUrl,
              color: method.color,
            }
          : null,
        account: account
          ? { id: account.id, name: account.name, color: account.color }
          : null,
        bank: bank
          ? {
              id: bank.id,
              name: bank.name,
              color: bank.color,
              iconKey: bank.iconKey,
              logoUrl: bank.logoUrl,
            }
          : null,
        recipientMethod: recipientMethod
          ? {
              id: recipientMethod.id,
              name: recipientMethod.name,
              iconKey: recipientMethod.iconKey,
              logoUrl: recipientMethod.logoUrl,
              color: recipientMethod.color,
            }
          : null,
        tags: p.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
        status: ev?.status ?? 'scheduled',
        seriesFlagNote: p.flagNote ?? null,
        instanceFlagNote: ev?.flagNote ?? null,
      });
    }
  }
  occurrences.sort((a, b) =>
    a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
  );

  const editable: Record<string, EditablePayment> = {};
  for (const p of payments) {
    editable[p.id] = {
      id: p.id,
      name: p.name,
      amountKind:
        p.amountKind === 'per_unit'
          ? 'per_unit'
          : p.amountKind === 'group'
            ? 'group'
            : 'fixed',
      amount: (p.amountMinor / 100).toFixed(2),
      lineItems: (p.lineItems ?? []).map((li) => ({
        id: li.id,
        name: li.name,
        value: (li.valueMinor / 100).toFixed(2),
        currency: li.currency,
        iconKey: li.iconKey,
        logoUrl: li.logoUrl,
        color: li.color,
      })),
      attachments: (p.attachments ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        contentType: a.contentType,
        size: a.size,
        url: a.url,
        pathname: a.pathname,
      })),
      unitName: p.unitName,
      defaultUnits: String(p.defaultUnits),
      feeKind:
        p.feeKind === 'fixed' || p.feeKind === 'percent' ? p.feeKind : 'none',
      feeValue:
        p.feeKind === 'fixed'
          ? (p.feeFixedMinor / 100).toFixed(2)
          : p.feeKind === 'percent'
            ? String(p.feePercent)
            : '',
      currency: p.currency,
      methodId: p.methodId,
      accountId: p.accountId,
      bankId: p.bankId,
      recipientMethodId: p.recipientMethodId,
      recurrence: p.recurrence,
      anchorDate: p.anchorDate,
      dayOfMonth: p.dayOfMonth == null ? '' : String(p.dayOfMonth),
      endsOn: p.endsOn,
      url: p.url,
      logoUrl: p.logoUrl,
      brandColor: p.brandColor,
      isSubscription: p.isSubscription,
      notes: p.notes,
      tags: p.tags.map((t) => t.name),
    };
  }

  const earliestAnchor = payments.map((p) => p.anchorDate).sort()[0];
  const startedMonth = earliestAnchor ? earliestAnchor.slice(0, 7) : null;

  const currency = payments[0]?.currency ?? user.defaultCurrency;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const groups: DayGroup[] = [];
  for (const occ of occurrences) {
    let group = groups.at(-1);
    if (!group || group.date !== occ.dueDate) {
      group = {
        date: occ.dueDate,
        relativeLabel: relativeLabel(today, occ.dueDate),
        occurrences: [],
        totalMinor: 0,
        currency: user.displayCurrency,
      };
      groups.push(group);
    }
    group.occurrences.push(occ);
    // The day total is in the display currency so a mixed-currency day still
    // adds up (an unconvertible amount — no rate — is left out).
    if (occ.status !== 'skipped') {
      const converted = convertMoney(occ.amount, user.displayCurrency, rates);
      if (converted.currency === user.displayCurrency.toUpperCase()) {
        group.totalMinor += converted.minorUnits;
      }
    }
  }

  const inMonth = occurrences.filter(
    (o) =>
      o.status !== 'skipped' &&
      o.dueDate >= monthStart &&
      o.dueDate <= monthEnd &&
      o.amount.currency === currency,
  );

  // Income, converted into the display currency so it lines up with the
  // per-month expense totals. A per-month row overrides the global setting —
  // an explicit amount (in its own currency), or hours worked (hourly mode).
  const toDisplay = (minor: number, cur: string) =>
    convertMoney(money(minor, cur), user.displayCurrency, rates).minorUnits;

  const incomeCurrency = user.incomeCurrency;
  const hourly = user.incomeMode === 'hourly';
  const fromHours = (h: number) => Math.round(user.hourlyRateMinor * h);
  const globalIncomeMinor = hourly
    ? fromHours(user.monthlyHours)
    : user.incomeMinor;

  const incomeRow = new Map(incomeRows.map((r) => [r.month, r]));
  const overriddenMonths = new Set(incomeRows.map((r) => r.month));
  const defaultIncomeMinor = toDisplay(globalIncomeMinor, incomeCurrency);
  const incomeByMonth: Record<string, number> = {};
  /** For the editor: the effective figure and the currency it's in. */
  const incomeRawByMonth: Record<
    string,
    { minor: number; currency: string }
  > = {};
  /** For the editor: what a month's override actually stores. */
  const incomeOverrideByMonth: Record<
    string,
    { amountMinor: number | null; currency: string | null; hours: number | null }
  > = {};
  for (
    let m = startOfMonth(from);
    m <= to;
    m = startOfMonth(addMonths(m, 1))
  ) {
    const key = m.slice(0, 7);
    const row = incomeRow.get(key);
    let raw = globalIncomeMinor;
    let cur = incomeCurrency;
    if (row) {
      if (row.amountMinor != null) {
        raw = row.amountMinor;
        cur = row.currency ?? incomeCurrency;
      } else if (row.hours != null) {
        raw = fromHours(row.hours);
      }
      incomeOverrideByMonth[key] = {
        amountMinor: row.amountMinor,
        currency: row.currency,
        hours: row.hours,
      };
    }
    incomeRawByMonth[key] = { minor: raw, currency: cur };
    incomeByMonth[key] = toDisplay(raw, cur);
  }

  return {
    today,
    window: { from, to },
    startedMonth,
    occurrences,
    groups,
    editable,
    overrides: overridesByKey,
    hasPayments: payments.length > 0,
    displayCurrency: user.displayCurrency,
    defaultCurrency: user.defaultCurrency,
    incomeMode: hourly ? ('hourly' as const) : ('fixed' as const),
    incomeCurrency,
    hourlyRateMinor: user.hourlyRateMinor,
    monthlyHours: user.monthlyHours,
    incomeByMonth,
    incomeRawByMonth,
    incomeOverrideByMonth,
    defaultIncomeMinor,
    globalIncomeMinor,
    overriddenIncomeMonths: [...overriddenMonths],
    rates,
    usedCurrencies: [...new Set(payments.map((p) => p.currency))],
    summary: {
      currency,
      dueThisMonthMinor: inMonth.reduce((s, o) => s + o.amount.minorUnits, 0),
      recurringMinor: inMonth
        .filter((o) => !o.isOneTime)
        .reduce((s, o) => s + o.amount.minorUnits, 0),
      oneTimeMinor: inMonth
        .filter((o) => o.isOneTime)
        .reduce((s, o) => s + o.amount.minorUnits, 0),
      count: occurrences.filter((o) => o.status !== 'skipped').length,
    },
  };
}
