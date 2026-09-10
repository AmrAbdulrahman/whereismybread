'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { debtHeadline, formatDebtAmount, formatMoney, money } from '@wib/domain';
import {
  AttachmentViewer,
  AttachmentsField,
  Button,
  Progress,
  ResponsiveModal,
  attachmentSrc,
  useToast,
  type StoredAttachment,
  type ViewableAttachment,
} from '@wib/ui';
import {
  ChevronLeft,
  Link as LinkIcon,
  Paperclip,
  Pencil,
  Send,
  Trash2,
} from '@wib/ui/icons';
import {
  deleteDebtAction,
  deleteRepaymentAction,
  discardDebtBlobsAction,
  removeDebtAttachmentAction,
  resendPersonLinkAction,
  settleDebtAction,
  uploadDebtAttachmentAction,
} from '../lib/actions';
import type { DebtDetail as DebtDetailData, PersonView } from '../lib/types';
import { DebtForm, type DebtFormInitial } from './debt-form';
import { GoldMark } from './gold-mark';
import { PersonAvatar } from './person-avatar';
import { RepaymentForm } from './repayment-form';

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));
}

export function DebtDetail({
  debt,
  people,
  today,
  usedCurrencies,
  defaultCurrency,
  displayCurrency,
  shareUrl,
}: {
  debt: DebtDetailData;
  people: PersonView[];
  today: string;
  usedCurrencies: string[];
  defaultCurrency: string;
  displayCurrency: string;
  shareUrl: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [repayOpen, setRepayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [debtFiles, setDebtFiles] = useState<StoredAttachment[]>(
    debt.attachments,
  );
  const [viewing, setViewing] = useState<ViewableAttachment | null>(null);

  const pct = Math.round(debt.progress * 100);
  const sameCurrency =
    debt.denom.kind === 'money' &&
    debt.denom.currency.toUpperCase() === displayCurrency.toUpperCase();
  const equivalent =
    debt.equivalentMinor != null && !sameCurrency
      ? formatMoney(money(debt.equivalentMinor, displayCurrency))
      : null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        toast({ title: result.error ?? 'Something went wrong.', tone: 'danger' });
      } else if (result.message) {
        toast({ title: result.message });
      }
      router.refresh();
      return result.ok;
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copied.' });
    } catch {
      toast({ title: 'Could not copy — select and copy it manually.', tone: 'danger' });
    }
  };

  const initialForEdit: DebtFormInitial = {
    id: debt.id,
    personId: debt.person.id,
    direction: debt.direction,
    principalMinor: debt.principalMinor,
    denom: debt.denom,
    incurredOn: debt.incurredOn,
    description: debt.description,
    notes: debt.notes,
    attachments: debt.attachments,
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Link
        href="/debts"
        className="flex items-center gap-1 self-start text-sm text-muted hover:text-ink"
      >
        <ChevronLeft size={16} />
        All debts
      </Link>

      <header className="flex items-start gap-3">
        <PersonAvatar person={debt.person} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold sm:text-xl">
            {debtHeadline(debt.direction, debt.person.name)}
          </h1>
          <p className="text-sm text-ink-soft">
            {debt.description || 'No description'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Incurred {fmtDate(debt.incurredOn)}
          </p>
          {debt.notes ? (
            <p className="mt-1 text-xs text-muted">{debt.notes}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label="Edit debt"
            onClick={() => setEditOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <Pencil size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Delete debt"
            onClick={() => setConfirmDelete(true)}
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 size={15} strokeWidth={2} />
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1.5 text-2xl font-bold text-ink">
            {debt.denom.kind === 'gold' ? (
              <GoldMark type={debt.denom.goldType} size={18} />
            ) : null}
            {formatDebtAmount(debt.remainingMinor, debt.denom)}
          </span>
          <span className="text-sm text-muted">
            {debt.settled ? 'settled' : 'still owed'}
          </span>
        </div>
        {equivalent ? (
          <p className="-mt-1 text-xs text-ink-soft">≈ {equivalent} in {displayCurrency}</p>
        ) : null}
        <Progress
          value={pct}
          indicatorClassName={debt.settled ? 'bg-teal' : undefined}
        />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {formatDebtAmount(debt.paidMinor, debt.denom)} repaid of{' '}
            {formatDebtAmount(debt.principalMinor, debt.denom)}
          </span>
          <span>{pct}%</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRepayOpen(true)} disabled={busy}>
            Record repayment
          </Button>
          {debt.settled ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => settleDebtAction(debt.id, false))}
            >
              Reopen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => settleDebtAction(debt.id, true))}
            >
              Settle in full
            </Button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <LinkIcon size={15} className="text-muted" />
          <h2 className="text-sm font-semibold text-ink">Transparency link</h2>
        </div>
        <p className="text-xs text-ink-soft">
          {debt.person.name} can open this to follow the debt — after a one-time
          code sent to {debt.person.email}.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            aria-label="Shared debt link"
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 flex-1 rounded-md border border-line-strong bg-ground px-2 text-xs text-ink-soft"
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void copyLink()}>
            Copy
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => void run(() => resendPersonLinkAction(debt.person.id))}
        >
          <Send size={14} strokeWidth={2} />
          Email it to them
        </Button>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Paperclip size={15} className="text-muted" />
          <h2 className="text-sm font-semibold text-ink">Attachments</h2>
        </div>
        <p className="text-xs text-ink-soft">
          Receipts or an IOU — {debt.person.name} sees these too.
        </p>
        <AttachmentsField
          inputId="debt-detail-attachment"
          ownerId={debt.id}
          saved={debtFiles}
          onSavedChange={setDebtFiles}
          drafts={[]}
          onDraftsChange={() => undefined}
          upload={(ownerId, form) =>
            uploadDebtAttachmentAction(ownerId, null, form)
          }
          remove={removeDebtAttachmentAction}
          discard={discardDebtBlobsAction}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Repayments
        </h2>
        {debt.entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
            Nothing repaid yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {debt.entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-1.5 rounded-lg border border-line/60 bg-surface px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {formatDebtAmount(e.amountMinor, debt.denom)}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {fmtDate(e.occurredOn)}
                      {e.note ? ` · ${e.note}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete repayment"
                    disabled={busy}
                    onClick={() =>
                      void run(() => deleteRepaymentAction(debt.id, e.id))
                    }
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
                {e.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {e.attachments.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() =>
                          setViewing({
                            name: a.name,
                            url: attachmentSrc(a.pathname),
                            contentType: a.contentType,
                          })
                        }
                        className="flex items-center gap-1 rounded-md border border-line bg-ground px-2 py-1 text-[11px] text-ink-soft hover:text-ink"
                      >
                        <Paperclip size={11} strokeWidth={2} />
                        <span className="max-w-[10rem] truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AttachmentViewer
        attachment={viewing}
        onClose={() => setViewing(null)}
      />

      <ResponsiveModal
        open={repayOpen}
        onOpenChange={setRepayOpen}
        title="Record a repayment"
      >
        {repayOpen ? (
          <RepaymentForm
            debtId={debt.id}
            denom={debt.denom}
            remainingMinor={debt.remainingMinor}
            today={today}
            onDone={() => {
              setRepayOpen(false);
              router.refresh();
            }}
            onCancel={() => setRepayOpen(false)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit debt"
      >
        {editOpen ? (
          <DebtForm
            people={people}
            initial={initialForEdit}
            today={today}
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            onDone={() => {
              setEditOpen(false);
              router.refresh();
            }}
            onCancel={() => setEditOpen(false)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete debt?"
      >
        {confirmDelete ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              This debt and its {debt.entries.length}{' '}
              {debt.entries.length === 1 ? 'repayment' : 'repayments'} will be
              deleted. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const ok = await run(() => deleteDebtAction(debt.id));
                  if (ok) router.push('/debts');
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
