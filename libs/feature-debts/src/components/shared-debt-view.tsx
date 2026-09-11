import {
  debtEquivalentTotals,
  debtHeadlineForOther,
  denomKey,
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
import { DenomMark, denomLabel } from './denom-mark';

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
  const logos = new Map(view.things.map((t) => [t.id, t.logoUrl]));
  const eq = debtEquivalentTotals(
    open.map((d) => ({
      direction: d.direction,
      equivalentMinor: d.equivalentMinor,
    })),
  );
  const fmt = (m: number) => formatMoney(money(m, view.displayCurrency));

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
          <span className="text-warn">≈ {fmt(eq.theyOweMinor)} you owe</span> ·{' '}
          <span className="text-teal">≈ {fmt(eq.iOweMinor)} owed to you</span>
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
            {(list as SharedView['debts']).map((d) => (
              <article
                key={d.id}
                className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {debtHeadlineForOther(d.direction, view.ownerName)}
                  </p>
                  <p className="shrink-0 text-[11px] text-muted">
                    {d.description ? `${d.description} · ` : ''}
                    {fmtDate(d.incurredOn)}
                  </p>
                </div>

                {d.balances.map((b) => {
                  const pct = Math.round(b.progress * 100);
                  return (
                    <div key={denomKey(b.denom)} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          <DenomMark denom={b.denom} size={12} logos={logos} />
                          {formatDebtAmount(b.outstandingMinor, b.denom)}
                          <span className="text-[11px] font-normal text-muted">
                            {b.settled ? 'settled' : 'left'}
                          </span>
                        </span>
                        <span className="text-[11px] text-muted">
                          {denomLabel(b.denom)}
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        indicatorClassName={b.settled ? 'bg-teal' : undefined}
                      />
                      <p className="text-[11px] text-muted">
                        {formatDebtAmount(b.repaidMinor, b.denom)} repaid of{' '}
                        {formatDebtAmount(b.owedMinor, b.denom)} · {pct}%
                      </p>
                    </div>
                  );
                })}

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
                          <span className="flex items-center gap-1 font-medium text-ink">
                            <DenomMark denom={e.denom} size={11} logos={logos} />
                            {formatDebtAmount(e.amountMinor, e.denom)}
                          </span>
                        </div>
                        <AttachmentChips files={e.attachments} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
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
