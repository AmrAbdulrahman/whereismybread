'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  debtHeadline,
  formatMoney,
  money,
  summariseDebts,
} from '@wib/domain';
import { Button, Progress, ResponsiveModal, cn } from '@wib/ui';
import { Plus, Scale, Users } from '@wib/ui/icons';
import type { DebtsData, DebtView } from '../lib/types';
import { DebtForm } from './debt-form';
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
          <PersonAvatar person={debt.person} size={38} />
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
              {formatMoney(money(debt.remainingMinor, debt.currency))}
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
              {formatMoney(money(debt.paidMinor, debt.currency))} of{' '}
              {formatMoney(money(debt.principalMinor, debt.currency))} repaid
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

export function DebtsView({ data }: { data: DebtsData }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const totals = summariseDebts(
    data.debts.map((d) => ({
      direction: d.direction,
      currency: d.currency,
      principalMinor: d.principalMinor,
      paidMinor: d.paidMinor,
    })),
  );

  const open = data.debts.filter((d) => !d.settled);
  const settled = data.debts.filter((d) => d.settled);
  const empty = data.debts.length === 0;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold sm:text-2xl">Debts</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft sm:text-sm">
            Money owed, and how repayment is going.
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
            onClick={() => setFormOpen(true)}
          >
            <Plus size={16} strokeWidth={3} />
            New debt
          </Button>
        </div>
      </header>

      {totals.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {totals.map((t) => (
            <li
              key={t.currency}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm"
            >
              <Scale size={16} className="shrink-0 text-muted" />
              <span className="text-teal">
                {formatMoney(money(t.theyOweMinor, t.currency))} owed to you
              </span>
              <span className="text-muted">·</span>
              <span className="text-warn">
                {formatMoney(money(t.iOweMinor, t.currency))} you owe
              </span>
              <span
                className={cn(
                  'ml-auto font-semibold',
                  t.netMinor >= 0 ? 'text-teal' : 'text-warn',
                )}
              >
                {t.netMinor >= 0 ? '+' : '−'}
                {formatMoney(money(Math.abs(t.netMinor), t.currency))}
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
          <Button size="lg" onClick={() => setFormOpen(true)}>
            <Plus size={18} strokeWidth={3} />
            New debt
          </Button>
        </div>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {open.map((d) => (
                <DebtCard key={d.id} debt={d} />
              ))}
            </ul>
          ) : null}
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
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New debt"
      >
        {formOpen ? (
          <DebtForm
            people={data.people}
            today={data.today}
            defaultCurrency={data.defaultCurrency}
            usedCurrencies={data.usedCurrencies}
            onDone={(debtId) => {
              setFormOpen(false);
              router.push(`/debts/${debtId}`);
            }}
            onCancel={() => setFormOpen(false)}
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
