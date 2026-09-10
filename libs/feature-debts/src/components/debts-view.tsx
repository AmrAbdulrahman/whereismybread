'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { debtHeadline, formatDebtAmount, summariseDebts } from '@wib/domain';
import { Button, Progress, ResponsiveModal, cn } from '@wib/ui';
import { Plus, Scale, Users } from '@wib/ui/icons';
import type { DebtsData, DebtView } from '../lib/types';
import { NewDebtsForm } from './new-debts-form';
import { PeopleManager } from './people-manager';
import { PersonAvatar } from './person-avatar';

function DebtCard({ debt }: { debt: DebtView }) {
  const pct = Math.round(debt.progress * 100);
  return (
    <li>
      <Link
        href={`/debts/${debt.id}`}
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong sm:p-4"
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
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-ink">
              {formatDebtAmount(debt.remainingMinor, debt.denom)}
            </p>
            <p className="text-[11px] text-muted">
              {debt.settled ? 'settled' : 'left'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Progress
            value={pct}
            indicatorClassName={debt.settled ? 'bg-teal' : undefined}
          />
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>
              {formatDebtAmount(debt.paidMinor, debt.denom)} of{' '}
              {formatDebtAmount(debt.principalMinor, debt.denom)} repaid
            </span>
            {debt.settled ? (
              <span className="font-semibold text-teal">Settled</span>
            ) : (
              <span>{pct}%</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

/** The per-denomination outstanding line(s) for one person. */
function PersonSummary({ debts }: { debts: DebtView[] }) {
  const totals = summariseDebts(
    debts.map((d) => ({
      direction: d.direction,
      denom: d.denom,
      principalMinor: d.principalMinor,
      paidMinor: d.paidMinor,
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
    </div>
  );
}

export function DebtsView({ data }: { data: DebtsData }) {
  const router = useRouter();
  const [newDebts, setNewDebts] = useState<
    { person?: DebtsData['people'][number] } | null
  >(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const totals = summariseDebts(
    data.debts.map((d) => ({
      direction: d.direction,
      denom: d.denom,
      principalMinor: d.principalMinor,
      paidMinor: d.paidMinor,
    })),
  );

  const open = data.debts.filter((d) => !d.settled);
  const settled = data.debts.filter((d) => d.settled);
  const empty = data.debts.length === 0;

  // Group the open debts under one panel per person (most-recent activity first).
  const groups: { person: DebtView['person']; debts: DebtView[] }[] = [];
  const byPerson = new Map<string, { person: DebtView['person']; debts: DebtView[] }>();
  for (const d of open) {
    let group = byPerson.get(d.person.id);
    if (!group) {
      group = { person: d.person, debts: [] };
      byPerson.set(d.person.id, group);
      groups.push(group);
    }
    group.debts.push(d);
  }

  const finishNew = (debtIds: string[]) => {
    setNewDebts(null);
    const only = debtIds.length === 1 ? debtIds[0] : null;
    if (only) router.push(`/debts/${only}`);
    else router.refresh();
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
            onClick={() => setNewDebts({})}
          >
            <Plus size={16} strokeWidth={3} />
            New debt
          </Button>
        </div>
      </header>

      {totals.length > 0 ? (
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
      ) : null}

      {empty ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-lg font-semibold">No debts tracked yet</h2>
          <p className="max-w-xs text-sm text-ink-soft">
            Add a debt — who it&apos;s with and how much — and they&apos;ll get a
            private link to follow the repayments.
          </p>
          <Button size="lg" onClick={() => setNewDebts({})}>
            <Plus size={18} strokeWidth={3} />
            New debt
          </Button>
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <section
              key={g.person.id}
              className="flex flex-col gap-3 rounded-xl border border-line/70 bg-surface/40 p-3 sm:p-4"
            >
              <div className="flex items-start gap-3">
                <PersonAvatar person={g.person} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {g.person.name}
                  </p>
                  <PersonSummary debts={g.debts} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setNewDebts({ person: g.person })}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Add
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                {g.debts.map((d) => (
                  <DebtCard key={d.id} debt={d} />
                ))}
              </ul>
            </section>
          ))}
          {settled.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Settled
              </h2>
              <ul className="flex flex-col gap-3 opacity-70">
                {settled.map((d) => (
                  <DebtCard key={d.id} debt={d} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <ResponsiveModal
        open={newDebts != null}
        onOpenChange={(o) => !o && setNewDebts(null)}
        title={newDebts?.person ? `New debt · ${newDebts.person.name}` : 'New debt'}
      >
        {newDebts ? (
          <NewDebtsForm
            people={data.people}
            person={newDebts.person}
            today={data.today}
            defaultCurrency={data.defaultCurrency}
            usedCurrencies={data.usedCurrencies}
            onDone={finishNew}
            onCancel={() => setNewDebts(null)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        title="People"
      >
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
