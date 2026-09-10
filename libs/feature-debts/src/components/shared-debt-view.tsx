import { debtHeadlineForOther, formatMoney, money } from '@wib/domain';
import { Progress, Wordmark } from '@wib/ui';
import type { SharedView } from '../lib/types';

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));
}

/** The read-only page the OTP-verified other party sees. No actions. */
export function SharedDebtView({
  view,
  preview = false,
}: {
  view: SharedView;
  preview?: boolean;
}) {
  const open = view.debts.filter((d) => !d.settled);
  const settled = view.debts.filter((d) => d.settled);

  return (
    <div className="flex flex-col gap-6">
      <Wordmark />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Hi {view.personName}</h1>
        <p className="text-sm text-ink-soft">
          {preview
            ? 'This is what the other party sees once they verify their email.'
            : `${view.ownerName} shared this so you can both see where things stand.`}
        </p>
      </div>

      {view.debts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          Nothing to show right now.
        </p>
      ) : null}

      {[
        ['', open],
        ['Settled', settled],
      ].map(([label, list]) =>
        (list as SharedView['debts']).length === 0 ? null : (
          <section key={label as string} className="flex flex-col gap-3">
            {label ? (
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {label as string}
              </h2>
            ) : null}
            {(list as SharedView['debts']).map((d) => {
              const pct = Math.round(d.progress * 100);
              return (
                <article
                  key={d.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {debtHeadlineForOther(d.direction, view.ownerName)}
                    </p>
                    <p className="shrink-0 text-sm font-semibold text-ink">
                      {formatMoney(money(d.remainingMinor, d.currency))}
                      <span className="ml-1 text-[11px] font-normal text-muted">
                        {d.settled ? 'settled' : 'left'}
                      </span>
                    </p>
                  </div>
                  {d.description ? (
                    <p className="-mt-1 text-xs text-ink-soft">{d.description}</p>
                  ) : null}
                  <Progress
                    value={pct}
                    indicatorClassName={d.settled ? 'bg-teal' : undefined}
                  />
                  <p className="text-[11px] text-muted">
                    {formatMoney(money(d.paidMinor, d.currency))} repaid of{' '}
                    {formatMoney(money(d.principalMinor, d.currency))} · {pct}%
                  </p>

                  {d.entries.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1 border-t border-line/60 pt-2">
                      {d.entries.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted">
                            {fmtDate(e.occurredOn)}
                            {e.note ? ` · ${e.note}` : ''}
                          </span>
                          <span className="font-medium text-ink">
                            {formatMoney(money(e.amountMinor, d.currency))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </section>
        ),
      )}

      <p className="text-center text-[11px] text-muted">
        Shared via Where Is My Bread · this page is private to you and{' '}
        {view.ownerName}.
      </p>
    </div>
  );
}
