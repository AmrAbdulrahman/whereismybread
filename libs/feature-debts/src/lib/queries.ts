import 'server-only';
import { requireUser } from '@wib/auth/server';
import {
  findUserById,
  getDebtWithEntries,
  getGoldSpotUsdPerOz,
  getRates,
  getSharedPersonDebts,
  listDebtPeople,
  listDebtsWithProgress,
  type Debt,
  type DebtAttachment,
  type DebtEntry,
  type DebtPerson,
} from '@wib/db';
import {
  debtProgress,
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

export function denomOf(d: Debt): DebtDenomination {
  if (d.denomKind === 'gold') {
    const goldType = d.goldType ?? 'k21';
    return {
      kind: 'gold',
      goldType,
      goldLabel: d.goldLabel,
      unit: goldUnitFor(goldType, d.goldUnit),
    };
  }
  return { kind: 'money', currency: d.currency };
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
    amountMinor: e.amountMinor,
    note: e.note,
    occurredOn: e.occurredOn,
    createdAt: String(e.createdAt),
    attachments: (e.attachments ?? []).map(att),
  };
}

export function buildDebtView(
  d: Debt,
  paidMinorRaw: number,
  entryCount: number,
  person: PersonView,
  px: PricingCtx,
): DebtView {
  const p = debtProgress({
    principalMinor: d.principalMinor,
    paidMinor: paidMinorRaw,
  });
  const denom = denomOf(d);
  const eq = (minor: number) =>
    debtEquivalentMinor(
      denom,
      minor,
      px.rates,
      px.usdPerOz,
      px.displayCurrency,
    );
  return {
    id: d.id,
    direction: d.direction as DebtDirection,
    denom,
    principalMinor: d.principalMinor,
    paidMinor: p.paidMinor,
    remainingMinor: p.remainingMinor,
    progress: p.progress,
    settled: d.settledAt != null || p.settled,
    description: d.description,
    notes: d.notes,
    incurredOn: d.incurredOn,
    createdAt: String(d.createdAt),
    person,
    entryCount,
    equivalentMinor: eq(p.remainingMinor),
    principalEquivalentMinor: eq(d.principalMinor),
  };
}

/** Every debt + person the signed-in user owns. */
export async function getDebtsData(): Promise<DebtsData> {
  const user = await requireUser();
  const [rows, people] = await Promise.all([
    listDebtsWithProgress(user.id),
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
    .map((r) => {
      const person = byId.get(r.personId);
      return person
        ? buildDebtView(r, r.paidMinor, r.entryCount, person, px)
        : null;
    })
    .filter((d): d is DebtView => d != null);

  return {
    debts,
    people: peopleViews,
    usedCurrencies: [
      ...new Set([
        ...debts
          .map((d) => (d.denom.kind === 'money' ? d.denom.currency : null))
          .filter((c): c is string => c != null),
        user.defaultCurrency,
      ]),
    ],
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
    listDebtsWithProgress(user.id),
  ]);
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.personId, (count.get(r.personId) ?? 0) + 1);
  return people.map((p) => personView(p, count.get(p.id) ?? 0));
}

/** One debt with its full repayment timeline, or `null`. */
export async function getDebt(id: string): Promise<DebtDetail | null> {
  const user = await requireUser();
  const row = await getDebtWithEntries(user.id, id);
  if (!row) return null;
  const px = await loadPricing(user.displayCurrency);
  return {
    ...buildDebtView(row, row.paidMinor, row.entryCount, personView(row.person), px),
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
  return {
    personName: bundle.person.name,
    ownerName,
    displayCurrency,
    debts: bundle.debts.map((d) => {
      const paidMinor = d.entries.reduce((s, e) => s + e.amountMinor, 0);
      const p = debtProgress({ principalMinor: d.principalMinor, paidMinor });
      const denom = denomOf(d);
      return {
        id: d.id,
        direction: d.direction as DebtDirection,
        denom,
        principalMinor: d.principalMinor,
        paidMinor: p.paidMinor,
        remainingMinor: p.remainingMinor,
        progress: p.progress,
        settled: d.settledAt != null || p.settled,
        description: d.description,
        incurredOn: d.incurredOn,
        equivalentMinor: debtEquivalentMinor(
          denom,
          p.remainingMinor,
          px.rates,
          px.usdPerOz,
          displayCurrency,
        ),
        attachments: d.attachments.map(att),
        entries: d.entries.map(entryView),
      };
    }),
  };
}

/** For the shared page's owner-preview + grant check. */
export { getDebtPersonByShareId } from '@wib/db';
