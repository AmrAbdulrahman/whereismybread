import 'server-only';
import { requireUser } from '@wib/auth/server';
import {
  findUserById,
  getDebtWithDetail,
  getGoldSpotUsdPerOz,
  getRates,
  getSharedPersonDebts,
  listDebtPeople,
  listDebtThings,
  listDebtsWithLines,
  thingUseCounts,
  type DebtAttachment,
  type DebtEntry,
  type DebtLine,
  type DebtPerson,
  type DebtThing,
  type DebtWithLines,
} from '@wib/db';
import {
  convertMoney,
  debtIsSettled,
  denomBalances,
  goldUnitFor,
  money,
  todayIn,
  valueDrift,
  type DebtDenomination,
  type DebtDirection,
  type RateMap,
} from '@wib/domain';
import { serverEnv } from '@wib/config';
import type { StoredAttachment } from '@wib/ui';
import { debtEquivalentMinor, type ThingValueMap } from './pricing';
import type {
  DebtDetail,
  DebtEntryView,
  DebtsData,
  DebtView,
  DenomBalanceView,
  PersonView,
  SharedView,
  ThingView,
} from './types';

export interface PricingCtx {
  rates: RateMap;
  usdPerOz: number | null;
  displayCurrency: string;
  things: ThingValueMap;
}

/** Per-unit reference values keyed by thing id, for `debtEquivalentMinor`. */
export function thingValueMap(things: readonly DebtThing[]): ThingValueMap {
  return new Map(
    things.map((t) => [
      t.id,
      { valueMinor: t.valueMinor, valueCurrency: t.valueCurrency },
    ]),
  );
}

/** rates + gold spot + the user's display currency + thing values, once per request. */
export async function loadPricing(
  displayCurrency: string,
  things: readonly DebtThing[] = [],
): Promise<PricingCtx> {
  const rates = await getRates();
  const usdPerOz = await getGoldSpotUsdPerOz();
  return { rates, usdPerOz, displayCurrency, things: thingValueMap(things) };
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
  thingId: string | null;
  thingName: string | null;
}

/** Resolve the denomination stored on a `debt_lines` / `debt_entries` row. */
export function denomOf(r: DenomCols): DebtDenomination {
  if (r.denomKind === 'thing') {
    return {
      kind: 'thing',
      thingId: r.thingId ?? '',
      thingName: r.thingName ?? 'Item',
      unit: r.goldUnit === 'piece' ? 'piece' : 'g',
    };
  }
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

export function thingView(t: DebtThing, useCount = 0): ThingView {
  return {
    id: t.id,
    name: t.name,
    logoUrl: t.logoUrl,
    unit: t.unit === 'piece' ? 'piece' : 'g',
    valueMinor: t.valueMinor,
    valueCurrency: t.valueCurrency,
    useCount,
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
    originalValueMinor: number | null;
    originalValueCurrency: string | null;
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
      px.things,
    );
    if (b.outstandingMinor > 0 && equivalentMinor == null) anyUnpriced = true;
    return { ...b, equivalentMinor };
  });
  const equivalentMinor = anyUnpriced
    ? null
    : balances.reduce((s, b) => s + (b.equivalentMinor ?? 0), 0);

  // The full basket revalued at today's rates — independent of repayment
  // progress, so it can be compared against `originalValue` at lending.
  let anyPrincipalUnpriced = false;
  let principalTotal = 0;
  for (const b of balances0) {
    const v = debtEquivalentMinor(
      b.denom,
      b.owedMinor,
      px.rates,
      px.usdPerOz,
      px.displayCurrency,
      px.things,
    );
    if (v == null) anyPrincipalUnpriced = true;
    else principalTotal += v;
  }
  const principalEquivalentMinor = anyPrincipalUnpriced ? null : principalTotal;

  const originalValue =
    debt.originalValueMinor != null && debt.originalValueCurrency
      ? { amountMinor: debt.originalValueMinor, currency: debt.originalValueCurrency }
      : null;
  let drift: DebtView['valueDrift'] = null;
  if (originalValue && principalEquivalentMinor != null) {
    const target = px.displayCurrency.toUpperCase();
    const conv = convertMoney(
      money(originalValue.amountMinor, originalValue.currency),
      target,
      px.rates,
    );
    if (conv.currency === target) {
      drift = valueDrift(conv.minorUnits, principalEquivalentMinor);
    }
  }

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
    principalEquivalentMinor,
    originalValue,
    valueDrift: drift,
  };
}

/** Count how many loaded rows/entries reference each thing id. */
function thingUseCountsFromDebts(rows: DebtWithLines[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    for (const l of r.lines)
      if (l.thingId) out.set(l.thingId, (out.get(l.thingId) ?? 0) + 1);
    for (const e of r.entries)
      if (e.thingId) out.set(e.thingId, (out.get(e.thingId) ?? 0) + 1);
  }
  return out;
}

/** Every debt + person + thing the signed-in user owns. */
export async function getDebtsData(): Promise<DebtsData> {
  const user = await requireUser();
  const [rows, people, things] = await Promise.all([
    listDebtsWithLines(user.id),
    listDebtPeople(user.id),
    listDebtThings(user.id),
  ]);
  const px = await loadPricing(user.displayCurrency, things);

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

  const thingUse = thingUseCountsFromDebts(rows);
  const thingsView = things.map((t) => thingView(t, thingUse.get(t.id) ?? 0));

  const usedCurrencies = new Set<string>([user.defaultCurrency]);
  for (const d of debts)
    for (const b of d.balances)
      if (b.denom.kind === 'money') usedCurrencies.add(b.denom.currency);

  return {
    debts,
    people: peopleViews,
    things: thingsView,
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

/** Things + their use counts, for the things manager's optimistic refresh. */
export async function getDebtThings(): Promise<ThingView[]> {
  const user = await requireUser();
  const [things, uses] = await Promise.all([
    listDebtThings(user.id),
    thingUseCounts(user.id),
  ]);
  return things.map((t) => thingView(t, uses.get(t.id) ?? 0));
}

/** One debt with its rows + repayment timeline, or `null`. */
export async function getDebt(id: string): Promise<DebtDetail | null> {
  const user = await requireUser();
  const row = await getDebtWithDetail(user.id, id);
  if (!row) return null;
  const things = await listDebtThings(user.id);
  const px = await loadPricing(user.displayCurrency, things);
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
  const things = await listDebtThings(bundle.person.userId);
  const px = await loadPricing(displayCurrency, things);
  const stub = personView(bundle.person);
  return {
    personName: bundle.person.name,
    ownerName,
    displayCurrency,
    things: things.map((t) => ({ id: t.id, name: t.name, logoUrl: t.logoUrl })),
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
