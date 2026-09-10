import 'server-only';
import { requireUser } from '@wib/auth/server';
import {
  findUserById,
  getDebtWithDetail,
  getGoldSpotUsdPerOz,
  getRates,
  getSharedPersonDebts,
  listDebtPeople,
  listDebtsWithLines,
  type DebtAttachment,
  type DebtEntry,
  type DebtLine,
  type DebtPerson,
  type DebtWithLines,
} from '@wib/db';
import {
  debtIsSettled,
  denomBalances,
  goldUnitFor,
  todayIn,
  type DebtDenomination,
  type DebtDirection,
  type RateMap,
} from '@wib/domain';
import { serverEnv } from '@wib/config';
import type { StoredAttachment } from '@wib/ui';
import { debtEquivalentMinor } from './pricing';
import type {
  DebtDetail,
  DebtEntryView,
  DebtsData,
  DebtView,
  DenomBalanceView,
  PersonView,
  SharedView,
} from './types';

export interface PricingCtx {
  rates: RateMap;
  usdPerOz: number | null;
  displayCurrency: string;
}

/** rates + gold spot + the user's display currency, fetched once per request. */
export async function loadPricing(displayCurrency: string): Promise<PricingCtx> {
  const rates = await getRates();
  const usdPerOz = await getGoldSpotUsdPerOz();
  return { rates, usdPerOz, displayCurrency };
}

function att(a: DebtAttachment): StoredAttachment {
  return {
    id: a.id,
    name: a.name,
    contentType: a.contentType,
    size: a.size,
    url: a.url,
    pathname: a.pathname,
  };
}

interface DenomCols {
  denomKind: string;
  currency: string;
  goldType: string | null;
  goldLabel: string | null;
  goldUnit: string | null;
}

/** Resolve the denomination stored on a `debt_lines` / `debt_entries` row. */
export function denomOf(r: DenomCols): DebtDenomination {
  if (r.denomKind === 'gold') {
    const goldType = r.goldType ?? 'k21';
    return {
      kind: 'gold',
      goldType,
      goldLabel: r.goldLabel,
      unit: goldUnitFor(goldType, r.goldUnit),
    };
  }
  return { kind: 'money', currency: r.currency };
}

export function personView(p: DebtPerson, debtCount = 0): PersonView {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    photoUrl: p.photoUrl,
    shareId: p.shareId,
    debtCount,
  };
}

function entryView(
  e: DebtEntry & { attachments?: DebtAttachment[] },
): DebtEntryView {
  return {
    id: e.id,
    denom: denomOf(e),
    amountMinor: e.amountMinor,
    note: e.note,
    occurredOn: e.occurredOn,
    createdAt: String(e.createdAt),
    attachments: (e.attachments ?? []).map(att),
  };
}

/** The core view: principal rows + per-denomination running balances + pricing. */
export function buildDebtView(
  debt: {
    id: string;
    direction: string;
    description: string;
    notes: string | null;
    incurredOn: string;
    createdAt: unknown;
    settledAt: unknown;
  },
  lines: DebtLine[],
  entries: DebtEntry[],
  person: PersonView,
  px: PricingCtx,
): DebtView {
  const rows = lines.map((l) => ({
    id: l.id,
    denom: denomOf(l),
    amountMinor: l.amountMinor,
  }));
  const balances0 = denomBalances(
    rows.map((r) => ({ denom: r.denom, amountMinor: r.amountMinor })),
    entries.map((e) => ({ denom: denomOf(e), amountMinor: e.amountMinor })),
  );
  let anyUnpriced = false;
  const balances: DenomBalanceView[] = balances0.map((b) => {
    const equivalentMinor = debtEquivalentMinor(
      b.denom,
      b.outstandingMinor,
      px.rates,
      px.usdPerOz,
      px.displayCurrency,
    );
    if (b.outstandingMinor > 0 && equivalentMinor == null) anyUnpriced = true;
    return { ...b, equivalentMinor };
  });
  const equivalentMinor = anyUnpriced
    ? null
    : balances.reduce((s, b) => s + (b.equivalentMinor ?? 0), 0);

  return {
    id: debt.id,
    direction: debt.direction as DebtDirection,
    description: debt.description,
    notes: debt.notes,
    incurredOn: debt.incurredOn,
    createdAt: String(debt.createdAt),
    settled: debtIsSettled(
      balances,
      debt.settledAt as string | Date | null | undefined,
    ),
    person,
    rows,
    balances,
    entryCount: entries.length,
    equivalentMinor,
  };
}

/** Every debt + person the signed-in user owns. */
export async function getDebtsData(): Promise<DebtsData> {
  const user = await requireUser();
  const [rows, people] = await Promise.all([
    listDebtsWithLines(user.id),
    listDebtPeople(user.id),
  ]);
  const px = await loadPricing(user.displayCurrency);

  const countByPerson = new Map<string, number>();
  for (const r of rows) {
    countByPerson.set(r.personId, (countByPerson.get(r.personId) ?? 0) + 1);
  }
  const peopleViews = people.map((p) =>
    personView(p, countByPerson.get(p.id) ?? 0),
  );
  const byId = new Map(peopleViews.map((p) => [p.id, p]));

  const debts = rows
    .map((r: DebtWithLines) => {
      const person = byId.get(r.personId);
      return person ? buildDebtView(r, r.lines, r.entries, person, px) : null;
    })
    .filter((d): d is DebtView => d != null);

  const usedCurrencies = new Set<string>([user.defaultCurrency]);
  for (const d of debts)
    for (const b of d.balances)
      if (b.denom.kind === 'money') usedCurrencies.add(b.denom.currency);

  return {
    debts,
    people: peopleViews,
    usedCurrencies: [...usedCurrencies],
    defaultCurrency: user.defaultCurrency,
    displayCurrency: user.displayCurrency,
    today: todayIn(user.timezone),
    appUrl: serverEnv().APP_URL,
  };
}

/** People + their debt counts, for the manager's optimistic refresh. */
export async function getDebtPeople(): Promise<PersonView[]> {
  const user = await requireUser();
  const [people, rows] = await Promise.all([
    listDebtPeople(user.id),
    listDebtsWithLines(user.id),
  ]);
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.personId, (count.get(r.personId) ?? 0) + 1);
  return people.map((p) => personView(p, count.get(p.id) ?? 0));
}

/** One debt with its rows + repayment timeline, or `null`. */
export async function getDebt(id: string): Promise<DebtDetail | null> {
  const user = await requireUser();
  const row = await getDebtWithDetail(user.id, id);
  if (!row) return null;
  const px = await loadPricing(user.displayCurrency);
  return {
    ...buildDebtView(row, row.lines, row.entries, personView(row.person), px),
    entries: row.entries.map(entryView),
    attachments: row.attachments.map(att),
  };
}

/**
 * The read-only picture the OTP-verified other party sees. `null` when the
 * slug is unknown. The caller checks the grant / owner first.
 */
export async function getSharedView(shareId: string): Promise<SharedView | null> {
  const bundle = await getSharedPersonDebts(shareId);
  if (!bundle) return null;
  const owner = await findUserById(bundle.person.userId);
  const ownerName = owner?.name?.trim() || 'Someone';
  const displayCurrency = owner?.displayCurrency ?? 'EUR';
  const px = await loadPricing(displayCurrency);
  const stub = personView(bundle.person);
  return {
    personName: bundle.person.name,
    ownerName,
    displayCurrency,
    debts: bundle.debts.map((d) => {
      const v = buildDebtView(d, d.lines, d.entries, stub, px);
      return {
        id: v.id,
        direction: v.direction,
        description: v.description,
        incurredOn: v.incurredOn,
        settled: v.settled,
        rows: v.rows,
        balances: v.balances,
        entries: d.entries.map(entryView),
        attachments: d.attachments.map(att),
        equivalentMinor: v.equivalentMinor,
      };
    }),
  };
}

/** For the shared page's owner-preview + grant check. */
export { getDebtPersonByShareId } from '@wib/db';
