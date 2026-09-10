'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  debtEquivalentTotals,
  debtHeadline,
  denomKey,
  formatDebtAmount,
  formatMoney,
  money,
  summariseDebts,
} from '@wib/domain';
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { ChevronDown, Plus, Scale, Users } from '@wib/ui/icons';
import type { DebtsData, DebtView, DenomBalanceView } from '../lib/types';
import { DebtForm } from './debt-form';
import { GoldMark } from './gold-mark';
import { PeopleManager } from './people-manager';
import { PersonAvatar } from './person-avatar';

/** Flatten every debt's per-denomination balances for `summariseDebts`. */
function outstandingRows(debts: DebtView[]) {
  return debts.flatMap((d) =>
    d.balances.map((b) => ({
      direction: d.direction,
      denom: b.denom,
      outstandingMinor: b.outstandingMinor,
    })),
  );
}

/** Show a `≈` equivalent only when it adds information. */
function showEquivalent(debt: DebtView, displayCurrency: string): boolean {
  if (debt.equivalentMinor == null) return false;
  const only = debt.balances.length === 1 ? debt.balances[0] : null;
  return !(
    only != null &&
    only.denom.kind === 'money' &&
    only.denom.currency.toUpperCase() === displayCurrency.toUpperCase()
  );
}

function BalanceChip({ balance }: { balance: DenomBalanceView }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
        balance.settled
          ? 'border-line text-muted'
          : 'border-line-strong text-ink',
      )}
    >
      {balance.denom.kind === 'gold' ? (
        <GoldMark type={balance.denom.goldType} size={11} />
      ) : null}
      {formatDebtAmount(
        balance.settled ? balance.owedMinor : balance.outstandingMinor,
        balance.denom,
      )}
      <span className="text-muted">{balance.settled ? 'settled' : 'left'}</span>
    </span>
  );
}

function DebtCard({
  debt,
  displayCurrency,
}: {
  debt: DebtView;
  displayCurrency: string;
}) {
  const approx =
    showEquivalent(debt, displayCurrency) && debt.equivalentMinor != null
      ? `≈ ${formatMoney(money(debt.equivalentMinor, displayCurrency))}`
      : null;
  return (
    <li>
      <Link
        href={`/debts/${debt.id}`}
        className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong sm:p-4"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {debtHeadline(debt.direction, debt.person.name)}
            </p>
            <p className="truncate text-xs text-ink-soft">
              {debt.description || 'No description'}
            </p>
          </div>
          {approx ? (
            <p className="shrink-0 text-[11px] text-muted">{approx}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {debt.balances.map((b) => (
            <BalanceChip key={denomKey(b.denom)} balance={b} />
          ))}
          {debt.balances.length === 0 ? (
            <span className="text-[11px] text-muted">No amounts</span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** The per-denomination outstanding line(s) for one person, plus a `≈` net. */
function PersonSummary({
  debts,
  displayCurrency,
}: {
  debts: DebtView[];
  displayCurrency: string;
}) {
  const totals = summariseDebts(outstandingRows(debts));
  const eq = debtEquivalentTotals(
    debts.map((d) => ({
      direction: d.direction,
      equivalentMinor: d.equivalentMinor,
    })),
  );
  if (totals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      {totals.map((t, i) => (
        <span key={i} className="flex flex-wrap gap-x-2">
          {t.theyOweMinor > 0 ? (
            <span className="text-teal">
              {formatDebtAmount(t.theyOweMinor, t.denom)} to you
            </span>
          ) : null}
          {t.iOweMinor > 0 ? (
            <span className="text-warn">
              {formatDebtAmount(t.iOweMinor, t.denom)} you owe
            </span>
          ) : null}
        </span>
      ))}
      {eq.priced > 0 && (totals.length > 1 || eq.priced > 1) ? (
        <span className="text-muted">
          net ≈ {formatMoney(money(Math.abs(eq.netMinor), displayCurrency))}
          {eq.netMinor >= 0 ? ' to you' : ' you owe'}
        </span>
      ) : null}
    </div>
  );
}

export function DebtsView({ data }: { data: DebtsData }) {
  const router = useRouter();
  const [newDebt, setNewDebt] = useState<
    { person?: DebtsData['people'][number] } | null
  >(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  // Person panels start collapsed — expand on click.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<DebtView[]>([]);
  const [, startTransition] = useTransition();

  // Drop optimistic cards once the refreshed server data includes them.
  useEffect(() => {
    setPending((prev) => {
      const next = prev.filter((p) => !data.debts.some((d) => d.id === p.id));
      return next.length === prev.length ? prev : next;
    });
  }, [data.debts]);

  const toggleExpanded = (personId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });

  const merged: DebtView[] = [
    ...pending.filter((p) => !data.debts.some((d) => d.id === p.id)),
    ...data.debts,
  ];

  const totals = summariseDebts(outstandingRows(merged));

  const open = merged.filter((d) => !d.settled);
  const settled = merged.filter((d) => d.settled);
  const empty = merged.length === 0;

  const eqTotals = debtEquivalentTotals(
    open.map((d) => ({
      direction: d.direction,
      equivalentMinor: d.equivalentMinor,
    })),
  );
  const fmtApp = (m: number) => formatMoney(money(m, data.displayCurrency));

  // Group the open debts under one panel per person.
  const groups: { person: DebtView['person']; debts: DebtView[] }[] = [];
  const byPerson = new Map<
    string,
    { person: DebtView['person']; debts: DebtView[] }
  >();
  for (const d of open) {
    let group = byPerson.get(d.person.id);
    if (!group) {
      group = { person: d.person, debts: [] };
      byPerson.set(d.person.id, group);
      groups.push(group);
    }
    group.debts.push(d);
  }

  const finishNew = (result: { debtId: string; debt?: DebtView }) => {
    setNewDebt(null);
    if (result.debt) setPending((prev) => [...prev, result.debt as DebtView]);
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold sm:text-2xl">Debts</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft sm:text-sm">
            What&apos;s owed, and how repayment is going.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="sm:h-10 sm:px-4"
            onClick={() => setPeopleOpen(true)}
          >
            <Users size={15} strokeWidth={2} />
            People
          </Button>
          <Button
            size="sm"
            className="sm:h-10 sm:px-4"
            onClick={() => setNewDebt({})}
          >
            <Plus size={16} strokeWidth={3} />
            New debt
          </Button>
        </div>
      </header>

      {totals.length > 0 ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {totals.map((t, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm"
              >
                <Scale size={16} className="shrink-0 text-muted" />
                <span className="text-teal">
                  {formatDebtAmount(t.theyOweMinor, t.denom)} owed to you
                </span>
                <span className="text-muted">·</span>
                <span className="text-warn">
                  {formatDebtAmount(t.iOweMinor, t.denom)} you owe
                </span>
                <span
                  className={cn(
                    'ml-auto font-semibold',
                    t.netMinor >= 0 ? 'text-teal' : 'text-warn',
                  )}
                >
                  {t.netMinor >= 0 ? '+' : '−'}
                  {formatDebtAmount(Math.abs(t.netMinor), t.denom)}
                </span>
              </li>
            ))}
          </ul>
          {eqTotals.priced > 0 ? (
            <p className="px-1 text-xs text-ink-soft">
              <span className="text-teal">
                ≈ {fmtApp(eqTotals.theyOweMinor)} owed to you
              </span>{' '}
              ·{' '}
              <span className="text-warn">
                ≈ {fmtApp(eqTotals.iOweMinor)} you owe
              </span>{' '}
              ·{' '}
              <span className="font-semibold text-ink">
                net ≈ {eqTotals.netMinor >= 0 ? '+' : '−'}
                {fmtApp(Math.abs(eqTotals.netMinor))}
              </span>
              {eqTotals.unpriced > 0 ? (
                <span className="text-muted">
                  {' '}
                  · {eqTotals.unpriced} not priced
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-lg font-semibold">No debts tracked yet</h2>
          <p className="max-w-xs text-sm text-ink-soft">
            Add a debt — who it&apos;s with and how much — and they&apos;ll get a
            private link to follow the repayments.
          </p>
          <Button size="lg" onClick={() => setNewDebt({})}>
            <Plus size={18} strokeWidth={3} />
            New debt
          </Button>
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const isCollapsed = !expanded.has(g.person.id);
            return (
              <section
                key={g.person.id}
                className="flex flex-col gap-3 rounded-xl border border-line/70 bg-surface/40 p-3 sm:p-4"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(g.person.id)}
                    aria-expanded={!isCollapsed}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <ChevronDown
                      size={16}
                      className={cn(
                        'mt-2.5 shrink-0 text-muted transition-transform',
                        isCollapsed && '-rotate-90',
                      )}
                    />
                    <PersonAvatar person={g.person} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {g.person.name}
                        <span className="ml-1.5 font-normal text-muted">
                          {g.debts.length}
                        </span>
                      </p>
                      <PersonSummary
                        debts={g.debts}
                        displayCurrency={data.displayCurrency}
                      />
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setNewDebt({ person: g.person })}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    Add
                  </Button>
                </div>
                {isCollapsed ? null : (
                  <ul className="flex flex-col gap-2">
                    {g.debts.map((d) => (
                      <DebtCard
                        key={d.id}
                        debt={d}
                        displayCurrency={data.displayCurrency}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {settled.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Settled
              </h2>
              <ul className="flex flex-col gap-3 opacity-70">
                {settled.map((d) => (
                  <DebtCard
                    key={d.id}
                    debt={d}
                    displayCurrency={data.displayCurrency}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <ResponsiveModal
        open={newDebt != null}
        onOpenChange={(o) => !o && setNewDebt(null)}
        title={
          newDebt?.person ? `New debt · ${newDebt.person.name}` : 'New debt'
        }
      >
        {newDebt ? (
          <DebtForm
            people={data.people}
            person={newDebt.person}
            today={data.today}
            defaultCurrency={data.defaultCurrency}
            usedCurrencies={data.usedCurrencies}
            onDone={finishNew}
            onCancel={() => setNewDebt(null)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal open={peopleOpen} onOpenChange={setPeopleOpen} title="People">
        {peopleOpen ? (
          <PeopleManager
            initialPeople={data.people}
            onClose={() => setPeopleOpen(false)}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
