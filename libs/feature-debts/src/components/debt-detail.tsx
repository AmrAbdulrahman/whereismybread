'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  debtHeadline,
  denomKey,
  formatDebtAmount,
  formatMoney,
  money,
} from '@wib/domain';
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
  Plus,
  Send,
  Trash2,
} from '@wib/ui/icons';
import {
  deleteDebtAction,
  deleteLineAction,
  deleteRepaymentAction,
  discardDebtBlobsAction,
  removeDebtAttachmentAction,
  resendPersonLinkAction,
  settleDebtAction,
  settleDenomAction,
  uploadDebtAttachmentAction,
} from '../lib/actions';
import type {
  DebtDetail as DebtDetailData,
  DebtRowView,
  DenomBalanceView,
  PersonView,
  ThingView,
} from '../lib/types';
import { DebtForm, type DebtFormInitial } from './debt-form';
import { DenomMark, denomLabel } from './denom-mark';
import { LineForm } from './line-form';
import { PersonAvatar } from './person-avatar';
import { RepaymentForm } from './repayment-form';
import { ThingForm } from './thing-form';

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));
}

type RunResult = { ok: boolean; error?: string; message?: string };

export function DebtDetail({
  debt,
  people,
  things,
  today,
  usedCurrencies,
  defaultCurrency,
  displayCurrency,
  shareUrl,
}: {
  debt: DebtDetailData;
  people: PersonView[];
  things: ThingView[];
  today: string;
  usedCurrencies: string[];
  defaultCurrency: string;
  displayCurrency: string;
  shareUrl: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [repay, setRepay] = useState<{ presetKey?: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [lineEdit, setLineEdit] = useState<DebtRowView | 'new' | null>(null);
  const [addingThing, setAddingThing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const thingLogos = new Map(things.map((t) => [t.id, t.logoUrl]));
  const [busy, setBusy] = useState(false);
  const [debtFiles, setDebtFiles] = useState<StoredAttachment[]>(
    debt.attachments,
  );
  const [viewing, setViewing] = useState<ViewableAttachment | null>(null);

  const equivalent =
    debt.equivalentMinor != null
      ? formatMoney(money(debt.equivalentMinor, displayCurrency))
      : null;

  const run = async (fn: () => Promise<RunResult>) => {
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
      toast({
        title: 'Could not copy — select and copy it manually.',
        tone: 'danger',
      });
    }
  };

  const initialForEdit: DebtFormInitial = {
    id: debt.id,
    personId: debt.person.id,
    direction: debt.direction,
    incurredOn: debt.incurredOn,
    description: debt.description,
    notes: debt.notes,
    originalValueMinor: debt.originalValue?.amountMinor ?? null,
    originalValueCurrency: debt.originalValue?.currency ?? null,
  };

  const showBalanceEquivalent = (b: DenomBalanceView) =>
    b.equivalentMinor != null &&
    !(
      b.denom.kind === 'money' &&
      b.denom.currency.toUpperCase() === displayCurrency.toUpperCase()
    );

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
            {equivalent ? ` · ≈ ${equivalent} in ${displayCurrency}` : ''}
          </p>
          {debt.notes ? (
            <p className="mt-1 text-xs text-muted">{debt.notes}</p>
          ) : null}
          {debt.originalValue ? (
            <p className="mt-1 text-xs text-muted">
              Lending value{' '}
              {formatMoney(
                money(
                  debt.originalValue.amountMinor,
                  debt.originalValue.currency,
                ),
              )}
              {debt.valueDrift ? (
                <>
                  {' · '}
                  <span
                    className={
                      debt.valueDrift.deltaMinor >= 0
                        ? 'font-medium text-teal'
                        : 'font-medium text-danger'
                    }
                  >
                    {debt.valueDrift.deltaMinor >= 0 ? '+' : '−'}
                    {formatMoney(
                      money(
                        Math.abs(debt.valueDrift.deltaMinor),
                        displayCurrency,
                      ),
                    )}
                    {debt.valueDrift.pct != null
                      ? ` (${debt.valueDrift.pct >= 0 ? '+' : ''}${(
                          debt.valueDrift.pct * 100
                        ).toFixed(1)}%)`
                      : ''}
                  </span>{' '}
                  since lending
                </>
              ) : (
                " · today's value not available"
              )}
            </p>
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Balances
          </h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setRepay({})}
            >
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
                disabled={busy || debt.balances.length === 0}
                onClick={() => void run(() => settleDebtAction(debt.id, true))}
              >
                Settle in full
              </Button>
            )}
          </div>
        </div>

        {debt.balances.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
            No amounts yet — add a row below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {debt.balances.map((b) => {
              const pct = Math.round(b.progress * 100);
              return (
                <li
                  key={denomKey(b.denom)}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-lg font-bold text-ink">
                      <DenomMark denom={b.denom} size={16} logos={thingLogos} />
                      {formatDebtAmount(b.outstandingMinor, b.denom)}
                    </span>
                    <span className="text-xs text-muted">
                      {b.settled ? 'settled' : 'left'}
                    </span>
                  </div>
                  {showBalanceEquivalent(b) ? (
                    <p className="-mt-1 text-[11px] text-ink-soft">
                      ≈ {formatMoney(money(b.equivalentMinor ?? 0, displayCurrency))}
                    </p>
                  ) : null}
                  <Progress
                    value={pct}
                    indicatorClassName={b.settled ? 'bg-teal' : undefined}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>
                      {formatDebtAmount(b.repaidMinor, b.denom)} repaid of{' '}
                      {formatDebtAmount(b.owedMinor, b.denom)}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        setRepay({ presetKey: denomKey(b.denom) })
                      }
                    >
                      Record repayment
                    </Button>
                    {!b.settled ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            settleDenomAction(debt.id, denomKey(b.denom)),
                          )
                        }
                      >
                        Settle this
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Amounts
          </h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setLineEdit('new')}
          >
            <Plus size={14} strokeWidth={2.5} />
            Add a row
          </Button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {debt.rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-line/60 bg-surface px-3 py-2"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-ink">
                <DenomMark denom={r.denom} size={13} logos={thingLogos} />
                {formatDebtAmount(r.amountMinor, r.denom)}
                <span className="text-[11px] text-muted">
                  · {denomLabel(r.denom)}
                </span>
              </span>
              <button
                type="button"
                aria-label="Edit row"
                disabled={busy}
                onClick={() => setLineEdit(r)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
              >
                <Pencil size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Delete row"
                disabled={busy || debt.rows.length === 1}
                onClick={() =>
                  void run(() => deleteLineAction(debt.id, r.id))
                }
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copyLink()}
          >
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
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <DenomMark denom={e.denom} size={12} logos={thingLogos} />
                      {formatDebtAmount(e.amountMinor, e.denom)}
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

      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />

      <ResponsiveModal
        open={repay != null}
        onOpenChange={(o) => !o && setRepay(null)}
        title="Record a repayment"
      >
        {repay ? (
          <RepaymentForm
            debtId={debt.id}
            balances={debt.balances}
            presetDenomKey={repay.presetKey}
            today={today}
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            things={things}
            onDone={() => {
              setRepay(null);
              router.refresh();
            }}
            onCancel={() => setRepay(null)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={lineEdit != null}
        onOpenChange={(o) => !o && setLineEdit(null)}
        title={lineEdit === 'new' ? 'Add a row' : 'Edit row'}
      >
        {lineEdit ? (
          <LineForm
            debtId={debt.id}
            line={lineEdit === 'new' ? undefined : lineEdit}
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            things={things}
            onCreateThing={() => setAddingThing(true)}
            onDone={() => {
              setLineEdit(null);
              router.refresh();
            }}
            onCancel={() => setLineEdit(null)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={addingThing}
        onOpenChange={setAddingThing}
        title="New thing"
      >
        {addingThing ? (
          <ThingForm
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            onDone={() => {
              setAddingThing(false);
              router.refresh();
            }}
            onCancel={() => setAddingThing(false)}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal open={editOpen} onOpenChange={setEditOpen} title="Edit debt">
        {editOpen ? (
          <DebtForm
            people={people}
            initial={initialForEdit}
            today={today}
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            things={things}
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
