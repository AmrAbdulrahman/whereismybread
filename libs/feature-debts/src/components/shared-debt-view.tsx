import {
  debtEquivalentTotals,
  debtHeadlineForOther,
  formatDebtAmount,
  formatMoney,
  money,
} from '@wib/domain';
import {
  Progress,
  Wordmark,
  attachmentKind,
  attachmentSrc,
  type StoredAttachment,
} from '@wib/ui';
import { Paperclip } from '@wib/ui/icons';
import type { SharedView } from '../lib/types';
import { GoldMark } from './gold-mark';

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));
}

function AttachmentChips({ files }: { files: StoredAttachment[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((a) => (
        <a
          key={a.id}
          href={attachmentSrc(a.pathname)}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1 rounded-md border border-line bg-ground px-2 py-1 text-[11px] text-ink-soft hover:text-ink"
        >
          {attachmentKind(a.contentType) === 'image' ? (
            <img
              src={attachmentSrc(a.pathname)}
              alt=""
              className="h-4 w-4 rounded object-cover"
            />
          ) : (
            <Paperclip size={11} strokeWidth={2} />
          )}
          <span className="max-w-[10rem] truncate">{a.name}</span>
        </a>
      ))}
    </div>
  );
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
  const eq = debtEquivalentTotals(
    open.map((d) => ({
      direction: d.direction,
      // From the other party's view the direction is flipped.
      equivalentMinor: d.equivalentMinor,
    })),
  );
  const fmt = (m: number) =>
    formatMoney(money(m, view.displayCurrency));

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

      {eq.priced > 0 ? (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
          <span className="text-warn">≈ {fmt(eq.theyOweMinor)} you owe</span>{' '}
          · <span className="text-teal">≈ {fmt(eq.iOweMinor)} owed to you</span>
          {eq.unpriced > 0 ? (
            <span className="text-muted"> · {eq.unpriced} not priced</span>
          ) : null}
        </p>
      ) : null}

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
                    <p className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
                      {d.denom.kind === 'gold' ? (
                        <GoldMark type={d.denom.goldType} size={12} />
                      ) : null}
                      {formatDebtAmount(d.remainingMinor, d.denom)}
                      <span className="text-[11px] font-normal text-muted">
                        {d.settled ? 'settled' : 'left'}
                      </span>
                    </p>
                  </div>
                  <p className="-mt-1 text-xs text-ink-soft">
                    {d.description ? `${d.description} · ` : ''}
                    incurred {fmtDate(d.incurredOn)}
                    {d.equivalentMinor != null &&
                    !(
                      d.denom.kind === 'money' &&
                      d.denom.currency.toUpperCase() ===
                        view.displayCurrency.toUpperCase()
                    )
                      ? ` · ≈ ${fmt(d.equivalentMinor)}`
                      : ''}
                  </p>
                  <Progress
                    value={pct}
                    indicatorClassName={d.settled ? 'bg-teal' : undefined}
                  />
                  <p className="text-[11px] text-muted">
                    {formatDebtAmount(d.paidMinor, d.denom)} repaid of{' '}
                    {formatDebtAmount(d.principalMinor, d.denom)} · {pct}%
                  </p>

                  <AttachmentChips files={d.attachments} />

                  {d.entries.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1.5 border-t border-line/60 pt-2">
                      {d.entries.map((e) => (
                        <li key={e.id} className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted">
                              {fmtDate(e.occurredOn)}
                              {e.note ? ` · ${e.note}` : ''}
                            </span>
                            <span className="font-medium text-ink">
                              {formatDebtAmount(e.amountMinor, d.denom)}
                            </span>
                          </div>
                          <AttachmentChips files={e.attachments} />
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
