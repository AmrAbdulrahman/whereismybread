import 'server-only';
import { requireUser } from '@wib/auth/server';
import {
  findUserById,
  getDebtWithEntries,
  getSharedPersonDebts,
  listDebtPeople,
  listDebtsWithProgress,
  type Debt,
  type DebtEntry,
  type DebtPerson,
} from '@wib/db';
import { debtProgress, todayIn, type DebtDirection } from '@wib/domain';
import { serverEnv } from '@wib/config';
import type {
  DebtDetail,
  DebtEntryView,
  DebtsData,
  DebtView,
  PersonView,
  SharedView,
} from './types';

function personView(p: DebtPerson): PersonView {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    photoUrl: p.photoUrl,
    shareId: p.shareId,
  };
}

function entryView(e: DebtEntry): DebtEntryView {
  return {
    id: e.id,
    amountMinor: e.amountMinor,
    note: e.note,
    occurredOn: e.occurredOn,
    createdAt: String(e.createdAt),
  };
}

function debtView(
  d: Debt,
  paidMinorRaw: number,
  entryCount: number,
  person: DebtPerson,
): DebtView {
  const p = debtProgress({
    principalMinor: d.principalMinor,
    paidMinor: paidMinorRaw,
  });
  return {
    id: d.id,
    direction: d.direction as DebtDirection,
    currency: d.currency,
    principalMinor: d.principalMinor,
    paidMinor: p.paidMinor,
    remainingMinor: p.remainingMinor,
    progress: p.progress,
    settled: d.settledAt != null || p.settled,
    description: d.description,
    notes: d.notes,
    createdAt: String(d.createdAt),
    person: personView(person),
    entryCount,
  };
}

/** Every debt + person the signed-in user owns. */
export async function getDebtsData(): Promise<DebtsData> {
  const user = await requireUser();
  const [rows, people] = await Promise.all([
    listDebtsWithProgress(user.id),
    listDebtPeople(user.id),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const debts = rows
    .map((r) => {
      const person = byId.get(r.personId);
      return person ? debtView(r, r.paidMinor, r.entryCount, person) : null;
    })
    .filter((d): d is DebtView => d != null);

  return {
    debts,
    people: people.map(personView),
    usedCurrencies: [
      ...new Set([...debts.map((d) => d.currency), user.defaultCurrency]),
    ],
    defaultCurrency: user.defaultCurrency,
    today: todayIn(user.timezone),
    appUrl: serverEnv().APP_URL,
  };
}

/** One debt with its full repayment timeline, or `null`. */
export async function getDebt(id: string): Promise<DebtDetail | null> {
  const user = await requireUser();
  const row = await getDebtWithEntries(user.id, id);
  if (!row) return null;
  return {
    ...debtView(row, row.paidMinor, row.entryCount, row.person),
    entries: row.entries.map(entryView),
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
  return {
    personName: bundle.person.name,
    ownerName,
    debts: bundle.debts.map((d) => {
      const paidMinor = d.entries.reduce((s, e) => s + e.amountMinor, 0);
      const p = debtProgress({ principalMinor: d.principalMinor, paidMinor });
      return {
        id: d.id,
        direction: d.direction as DebtDirection,
        currency: d.currency,
        principalMinor: d.principalMinor,
        paidMinor: p.paidMinor,
        remainingMinor: p.remainingMinor,
        progress: p.progress,
        settled: d.settledAt != null || p.settled,
        description: d.description,
        entries: d.entries.map(entryView),
      };
    }),
  };
}

/** For the shared page's owner-preview + grant check. */
export { getDebtPersonByShareId } from '@wib/db';
