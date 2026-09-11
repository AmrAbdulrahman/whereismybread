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
import { Button, Progress, ResponsiveModal, cn } from '@wib/ui';
import { ChevronDown, Package, Plus, Scale, Users } from '@wib/ui/icons';
import type { DebtsData, DebtView, DenomBalanceView } from '../lib/types';
import { DebtForm } from './debt-form';
import { DenomMark, denomLabel } from './denom-mark';
import { PeopleManager } from './people-manager';
import { PersonAvatar } from './person-avatar';
import { ThingsManager } from './things-manager';

type Logos = Map<string, string | null>;

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

/**
 * Combine repayment progress across possibly-several denominations, by
 * revaluing each item's owed vs. outstanding amount into one currency — the
 * same equivalents already computed for the `≈` figures. `null` when that
 * can't be done for every item (a mixed basket with something unpriced).
 */
function combinedProgress(
  items: readonly {
    principalEquivalentMinor: number | null;
    equivalentMinor: number | null;
  }[],
): number | null {
  let owed = 0;
  let outstanding = 0;
  for (const it of items) {
    if (it.principalEquivalentMinor == null || it.equivalentMinor == null) {
      return null;
    }
    owed += it.principalEquivalentMinor;
    outstanding += it.equivalentMinor;
  }
  if (owed <= 0) return null;
  return Math.min(1, Math.max(0, 1 - outstanding / owed));
}

/** One debt's repayment progress (0–1), or `null` when it can't be shown. */
function debtProgress(debt: DebtView): number | null {
  const combined = combinedProgress([debt]);
  if (combined != null) return combined;
  // A single-denomination debt doesn't need FX/gold-spot/thing pricing at
  // all — fall back to that balance's own exact progress.
  return debt.balances.length === 1 ? (debt.balances[0]?.progress ?? null) : null;
}

/** A person's repayment progress across every one of their debts (0–1). */
function personProgress(debts: DebtView[]): number | null {
  return combinedProgress(debts);
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

function BalanceChip({
  balance,
  logos,
}: {
  balance: DenomBalanceView;
  logos: Logos;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
        balance.settled
          ? 'border-line text-muted'
          : 'border-line-strong text-ink',
      )}
    >
      <DenomMark denom={balance.denom} size={11} logos={logos} />
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
  logos,
}: {
  debt: DebtView;
  displayCurrency: string;
  logos: Logos;
}) {
  const approx =
    showEquivalent(debt, displayCurrency) && debt.equivalentMinor != null
      ? `≈ ${formatMoney(money(debt.equivalentMinor, displayCurrency))}`
      : null;
  const drift = debt.valueDrift;
  const progress = debtProgress(debt);
  return (
    <li>
      <Link
        href={`/debts/${debt.id}`}
        className={cn(
          'flex flex-col gap-2.5 rounded-xl border border-line border-l-4 bg-surface p-3.5 transition-colors hover:border-line-strong sm:p-4',
          debt.direction === 'i_owe' ? 'border-l-warn' : 'border-l-teal',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {debtHeadline(debt.direction, debt.person.name)}
            </p>
            <p className="truncate text-xs text-ink-soft">
              {debt.description || 'No description'}
            </p>
            {debt.notes ? (
              <p className="truncate text-[11px] text-muted">{debt.notes}</p>
            ) : null}
          </div>
          {approx || drift?.pct != null ? (
            <p className="shrink-0 text-[11px] text-muted">
              {approx}
              {drift?.pct != null ? (
                <span
                  className={cn(
                    'ml-1 font-medium',
                    drift.deltaMinor >= 0 ? 'text-teal' : 'text-danger',
                  )}
                >
                  {drift.pct >= 0 ? '+' : ''}
                  {(drift.pct * 100).toFixed(1)}%
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {progress != null ? (
          <Progress
            value={Math.round(progress * 100)}
            indicatorClassName={progress >= 1 ? 'bg-teal' : undefined}
          />
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {debt.balances.map((b) => (
            <BalanceChip key={denomKey(b.denom)} balance={b} logos={logos} />
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
  const progress = personProgress(debts);
  return (
    <div className="flex flex-col gap-1">
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
      {progress != null ? (
        <Progress
          value={Math.round(progress * 100)}
          className="h-1.5"
          indicatorClassName={progress >= 1 ? 'bg-teal' : undefined}
        />
      ) : null}
    </div>
  );
}

/** One card summarising every outstanding balance — one row per denomination. */
function TotalsCard({
  debts,
  displayCurrency,
  logos,
}: {
  debts: DebtView[];
  displayCurrency: string;
  logos: Logos;
}) {
  const totals = summariseDebts(outstandingRows(debts));
  const eq = debtEquivalentTotals(
    debts.map((d) => ({
      direction: d.direction,
      equivalentMinor: d.equivalentMinor,
    })),
  );
  if (totals.length === 0) return null;
  const fmtApp = (m: number) => formatMoney(money(m, displayCurrency));

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
        <Scale size={14} className="shrink-0" />
        Totals
      </div>
      <ul className="flex flex-col divide-y divide-line/60 px-3.5 py-2">
        {totals.map((t) => (
          <li
            key={denomKey(t.denom)}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <DenomMark denom={t.denom} size={14} logos={logos} />
              {denomLabel(t.denom)}
            </span>
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
      {eq.priced > 0 ? (
        <p className="border-t border-line/60 px-3.5 py-2.5 text-xs text-ink-soft">
          <span className="text-teal">≈ {fmtApp(eq.theyOweMinor)} owed to you</span>{' '}
          · <span className="text-warn">≈ {fmtApp(eq.iOweMinor)} you owe</span> ·{' '}
          <span className="font-semibold text-ink">
            net ≈ {eq.netMinor >= 0 ? '+' : '−'}
            {fmtApp(Math.abs(eq.netMinor))}
          </span>
          {eq.unpriced > 0 ? (
            <span className="text-muted"> · {eq.unpriced} not priced</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

// Remember which panels were open and how far down the page you'd scrolled,
// across a visit to a debt's detail page and back. sessionStorage (not the
// URL or a cookie) — per-tab, and irrelevant once the tab closes.
const EXPANDED_KEY = 'wib:debts:expanded';
const SCROLL_KEY = 'wib:debts:scroll';

function loadExpanded(): Set<string> {
  try {
    const raw = sessionStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(expanded: Set<string>) {
  try {
    sessionStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch {
    /* private/blocked storage — just don't persist */
  }
}

export function DebtsView({ data }: { data: DebtsData }) {
  const router = useRouter();
  const [newDebt, setNewDebt] = useState<
    { person?: DebtsData['people'][number] } | null
  >(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [thingsOpen, setThingsOpen] = useState(false);
  // Person panels start collapsed by default — restored from sessionStorage
  // just after mount (see the effect below), so the very first paint always
  // matches the server-rendered (all-collapsed) HTML and never fights React
  // hydration.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const thingLogos: Logos = new Map(data.things.map((t) => [t.id, t.logoUrl]));
  const [pending, setPending] = useState<DebtView[]>([]);
  const [, startTransition] = useTransition();

  // Drop optimistic cards once the refreshed server data includes them.
  useEffect(() => {
    setPending((prev) => {
      const next = prev.filter((p) => !data.debts.some((d) => d.id === p.id));
      return next.length === prev.length ? prev : next;
    });
  }, [data.debts]);

  // Restore expanded panels + scroll position once, after the first paint —
  // e.g. coming back from a debt's detail page shouldn't re-collapse
  // everything and dump you at the top.
  useEffect(() => {
    const restored = loadExpanded();
    if (restored.size > 0) setExpanded(restored);

    const y = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0);
    if (y > 0) {
      // Wait for the (possibly just-triggered) re-expand to render and lay
      // out before jumping, or we'd land at the wrong spot. Layout can take
      // a while to settle (slower devices, a busy machine), so keep nudging
      // it back into place for a bit rather than jumping once — but stop the
      // instant the user actually tries to scroll themselves.
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
      };
      const opts = { passive: true, once: true } as const;
      window.addEventListener('wheel', cancel, opts);
      window.addEventListener('touchstart', cancel, opts);

      const deadline = Date.now() + 500;
      const settle = () => {
        if (cancelled) return;
        window.scrollTo(0, y);
        if (Date.now() < deadline) requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);

      return () => {
        window.removeEventListener('wheel', cancel);
        window.removeEventListener('touchstart', cancel);
      };
    }
    return undefined;
  }, []);

  // Keep the scroll position fresh continuously — a <Link> navigation away
  // never fires beforeunload, so this is the only reliable place to save it.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const toggleExpanded = (personId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      saveExpanded(next);
      return next;
    });

  const merged: DebtView[] = [
    ...pending.filter((p) => !data.debts.some((d) => d.id === p.id)),
    ...data.debts,
  ];

  const open = merged.filter((d) => !d.settled);
  const settled = merged.filter((d) => d.settled);
  const empty = merged.length === 0;

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
            onClick={() => setThingsOpen(true)}
          >
            <Package size={15} strokeWidth={2} />
            Things
          </Button>
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

      <TotalsCard
        debts={merged}
        displayCurrency={data.displayCurrency}
        logos={thingLogos}
      />

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
                        logos={thingLogos}
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
                    logos={thingLogos}
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
            things={data.things}
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

      <ResponsiveModal open={thingsOpen} onOpenChange={setThingsOpen} title="Things">
        {thingsOpen ? (
          <ThingsManager
            initialThings={data.things}
            defaultCurrency={data.defaultCurrency}
            usedCurrencies={data.usedCurrencies}
            onClose={() => setThingsOpen(false)}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
