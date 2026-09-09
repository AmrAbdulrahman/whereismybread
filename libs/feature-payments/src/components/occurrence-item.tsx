'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatConverted,
  formatConvertedParts,
  money,
  type RateMap,
} from '@wib/domain';
import { cn, MethodIcon } from '@wib/ui';
import {
  ChevronDown,
  Flag,
  Link as LinkIcon,
  OctagonAlert,
  Pencil,
  PiggyBank,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Zap,
} from '@wib/ui/icons';
import { ActionMenu, type ActionMenuItem } from './action-menu';
import {
  assignPaymentAction,
  clearOccurrenceAction,
  markOccurrenceAction,
} from '../lib/actions';
import { dueAlertFor, type DueLevel } from '../lib/due-alert';
import type {
  BoardOccurrence,
  OccurrenceAccount,
  OccurrenceBudget,
  OccurrenceTag,
} from '../lib/types';
import {
  InlineAssignChip,
  InlineTagChip,
  type AssignOption,
} from './inline-assign-chip';
import { OccurrenceAttachments } from './occurrence-attachments';

const RECURRENCE_LABEL: Record<BoardOccurrence['recurrence'], string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const DUE_STYLE: Record<
  DueLevel,
  { card: string; text: string; Icon: typeof TriangleAlert }
> = {
  overdue: {
    card: 'border-danger/50 bg-danger/10',
    text: 'text-danger',
    Icon: OctagonAlert,
  },
  today: {
    card: 'border-warn/60 bg-warn/15',
    text: 'text-warn',
    Icon: TriangleAlert,
  },
  soon: {
    card: 'border-warn/50 bg-warn/10',
    text: 'text-warn',
    Icon: TriangleAlert,
  },
};

export function OccurrenceItem({
  occ,
  onEdit,
  onFlag,
  onDelete,
  onCreateAutomation,
  onToggle,
  displayCurrency,
  rates,
  today,
  compact = false,
  assign,
  highlight = false,
}: {
  occ: BoardOccurrence;
  onEdit?: (paymentId: string, dueDate: string) => void;
  /** Open the flag modal for this occurrence. */
  onFlag?: (paymentId: string, dueDate: string) => void;
  /** Open the delete-confirm for this occurrence (overflow menu). */
  onDelete?: (paymentId: string, dueDate: string) => void;
  /** Open the "new automation" dialog matching this payment (overflow menu). */
  onCreateAutomation?: () => void;
  /** Flash a ring around the card — a deep link from a notification landed here. */
  highlight?: boolean;
  /**
   * Enables the inline "+ account" / "+ budget" / "+ tag" chips — picking one
   * assigns it to the whole series without the edit modal, applied immediately
   * in the UI and saved in the background. Omit to hide the chips (compact /
   * read-only contexts). `tags` is the suggestion list.
   */
  assign?: {
    accounts: AssignOption[];
    budgets: AssignOption[];
    tags: { name: string; color: string }[];
  };
  /** Fired the instant the paid checkbox is clicked, before the server responds
   * — lets the list re-sort (paid → bottom) with an animation. */
  onToggle?: (paid: boolean) => void;
  displayCurrency: string;
  rates: RateMap;
  /** `board.today` — powers the "due tomorrow" / "overdue" markers. */
  today?: string;
  /** Drop the method / link / recurrence extras — for narrow containers. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showItems, setShowItems] = useState(false);
  const items = occ.lineItems && occ.lineItems.length > 0 ? occ.lineItems : null;
  // Flip the checkbox immediately. The month/day totals reconcile on the next
  // navigation (the page is `force-dynamic`); the write itself is instant.
  const [status, setStatus] = useOptimistic(
    occ.status,
    (_prev, next: BoardOccurrence['status']) => next,
  );
  const paid = status === 'paid';
  const skipped = status === 'skipped';
  const showAssign = assign != null && !skipped && !compact;

  // Inline assign is optimistic: reflect the pick straight away, save + refresh
  // in the background, then drop the override once the server board catches up.
  // `undefined` = no override (show the server value), `null` = optimistically
  // cleared, an object = optimistically (re)assigned.
  const [optAccount, setOptAccount] = useState<OccurrenceAccount | null | undefined>(
    undefined,
  );
  const [optBudget, setOptBudget] = useState<OccurrenceBudget | null | undefined>(
    undefined,
  );
  const [optTags, setOptTags] = useState<OccurrenceTag[] | null>(null);
  const account = optAccount === undefined ? occ.account : optAccount;
  const budget = optBudget === undefined ? occ.budget : optBudget;
  const tags = optTags ?? occ.tags;
  const tagSig = occ.tags.map((t) => t.id).join(',');
  useEffect(() => setOptAccount(undefined), [occ.account?.id]);
  useEffect(() => setOptBudget(undefined), [occ.budget?.id]);
  useEffect(() => setOptTags(null), [tagSig]);

  const assignPayment = (patch: {
    accountId?: string | null;
    budgetId?: string | null;
    tags?: string[];
  }) => {
    void assignPaymentAction(occ.paymentId, patch).then(() => router.refresh());
  };

  const dueAlert = today ? dueAlertFor(occ, today) : null;
  const dueStyle = dueAlert ? DUE_STYLE[dueAlert.level] : null;

  const flagNote = occ.instanceFlagNote ?? occ.seriesFlagNote;
  const flagScope = occ.instanceFlagNote
    ? 'this occurrence'
    : occ.seriesFlagNote
      ? 'whole series'
      : null;

  const toggle = () => {
    const nextPaid = occ.status !== 'paid';
    onToggle?.(nextPaid);
    startTransition(async () => {
      if (nextPaid) {
        setStatus('paid');
        await markOccurrenceAction({
          paymentId: occ.paymentId,
          dueDate: occ.dueDate,
          status: 'paid',
        });
      } else {
        setStatus('scheduled');
        await clearOccurrenceAction(occ.paymentId, occ.dueDate);
      }
    });
  };

  const restore = () => {
    onToggle?.(false);
    startTransition(async () => {
      setStatus('scheduled');
      await clearOccurrenceAction(occ.paymentId, occ.dueDate);
    });
  };

  const edgeColor = account?.color ?? occ.brandColor ?? null;

  const clickToEdit = onEdit != null && !skipped;
  const openEdit = () => onEdit?.(occ.paymentId, occ.dueDate);

  const menuItems: ActionMenuItem[] = [];
  if (onEdit && !skipped) {
    menuItems.push({
      label: 'Edit',
      icon: <Pencil size={13} strokeWidth={2} />,
      onSelect: openEdit,
    });
  }
  if (onFlag && !skipped) {
    menuItems.push({
      label: flagNote ? 'Edit flag' : 'Flag',
      icon: (
        <Flag
          size={13}
          strokeWidth={2}
          fill={flagNote ? 'currentColor' : 'none'}
        />
      ),
      onSelect: () => onFlag(occ.paymentId, occ.dueDate),
    });
  }
  if (onCreateAutomation && !skipped) {
    menuItems.push({
      label: 'Create automation',
      icon: <Zap size={13} strokeWidth={2} />,
      onSelect: onCreateAutomation,
    });
  }
  if (onDelete && !skipped) {
    menuItems.push({
      label: 'Delete',
      icon: <Trash2 size={13} strokeWidth={2} />,
      onSelect: () => onDelete(occ.paymentId, occ.dueDate),
      danger: true,
    });
  }

  // A click anywhere on the card opens the edit modal — except on a nested
  // control (checkbox, chips, links, the overflow menu).
  const onCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clickToEdit) return;
    if (
      (e.target as HTMLElement).closest(
        'button, a, input, label, [role="menu"], [role="listbox"], [role="dialog"]',
      )
    ) {
      return;
    }
    openEdit();
  };

  return (
    <div
      onClick={onCardClick}
      className={cn(
        'rounded-xl border border-line bg-surface transition-all duration-300',
        dueStyle?.card,
        edgeColor && 'border-l-[3px]',
        skipped && 'opacity-60',
        paid && 'opacity-45',
        clickToEdit && 'cursor-pointer',
        highlight &&
          'ring-2 ring-accent ring-offset-2 ring-offset-ground animate-pulse',
      )}
      style={edgeColor ? { borderLeftColor: edgeColor } : undefined}
    >
      <div
        className={cn(
          'flex items-center',
          compact
            ? 'gap-1.5 px-2.5 py-2 sm:gap-2'
            : 'gap-1.5 px-2.5 py-2.5 sm:gap-2.5 sm:px-3',
        )}
      >
      {skipped ? (
        <button
          type="button"
          onClick={restore}
          disabled={pending}
          aria-label={`Restore ${occ.name}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line-strong text-muted hover:text-ink"
        >
          <RotateCcw size={12} strokeWidth={2.5} />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={paid}
          aria-label={
            paid ? `Mark ${occ.name} unpaid` : `Mark ${occ.name} paid`
          }
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors',
            paid
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-line-strong text-transparent hover:border-accent',
          )}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      )}

      {occ.logoUrl && !skipped ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface">
          <img
            src={occ.logoUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit?.(occ.paymentId, occ.dueDate)}
          disabled={skipped}
          className="block w-full text-left disabled:cursor-default"
        >
          <div
            className={cn(
              'flex items-center gap-1.5 truncate text-sm font-semibold text-ink',
              (paid || skipped) && 'line-through decoration-2',
            )}
          >
            {dueAlert && dueStyle ? (
              <dueStyle.Icon
                size={compact ? 15 : 17}
                strokeWidth={2.25}
                aria-label={dueAlert.label}
                className={cn('shrink-0', dueStyle.text)}
              />
            ) : null}
            {occ.name}
            {occ.isException && !skipped ? (
              <span className="shrink-0 rounded bg-line-strong px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted">
                Edited
              </span>
            ) : null}
          </div>
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {occ.amountKind === 'per_unit' && occ.rate ? (
            <span
              className="rounded-full bg-line-strong/60 px-1.5 py-0.5 text-[10px] font-medium text-muted"
              title={`${occ.units} ${occ.unitName ?? 'unit'}${
                occ.units === 1 ? '' : 's'
              } × ${formatConverted(occ.rate, displayCurrency, rates)}`}
            >
              {occ.units} × {formatConverted(occ.rate, displayCurrency, rates)}
            </span>
          ) : null}
          {occ.feeMinor > 0 ? (
            <span
              className="rounded-full bg-line-strong/60 px-1.5 py-0.5 text-[10px] font-medium text-muted"
              title={`Includes a ${formatConverted(
                money(occ.feeMinor, occ.amount.currency),
                displayCurrency,
                rates,
              )} fee`}
            >
              {occ.feeLabel ??
                `+${formatConverted(
                  money(occ.feeMinor, occ.amount.currency),
                  displayCurrency,
                  rates,
                )}`}{' '}
              fee
            </span>
          ) : null}
          {showAssign && assign ? (
            <InlineAssignChip
              label="account"
              options={assign.accounts}
              current={account}
              onPick={(id) => {
                const a = assign.accounts.find((x) => x.id === id);
                if (a) setOptAccount(a);
                assignPayment({ accountId: id });
              }}
              onClear={() => {
                setOptAccount(null);
                assignPayment({ accountId: null });
              }}
            />
          ) : account ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: `${account.color}22`,
                color: account.color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: account.color }}
              />
              {account.name}
            </span>
          ) : null}
          {showAssign && assign ? (
            <InlineAssignChip
              label="budget"
              icon={<PiggyBank size={10} strokeWidth={2.5} />}
              options={assign.budgets}
              current={budget}
              onPick={(id) => {
                const b = assign.budgets.find((x) => x.id === id);
                if (b) setOptBudget(b);
                assignPayment({ budgetId: id });
              }}
              onClear={() => {
                setOptBudget(null);
                assignPayment({ budgetId: null });
              }}
            />
          ) : budget ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: `${budget.color}22`,
                color: budget.color,
              }}
            >
              <PiggyBank size={11} strokeWidth={2} className="shrink-0" />
              {budget.name}
            </span>
          ) : null}
          {tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: `${t.color}22`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
          {showAssign && assign ? (
            <InlineTagChip
              value={tags.map((t) => t.name)}
              suggestions={assign.tags}
              onChange={(names) => {
                setOptTags(
                  names.map((n) => {
                    const lc = n.toLowerCase();
                    const existing = occ.tags.find(
                      (t) => t.name.toLowerCase() === lc,
                    );
                    const suggested = assign.tags.find(
                      (t) => t.name.toLowerCase() === lc,
                    );
                    return {
                      id: existing?.id ?? n,
                      name: n,
                      color: existing?.color ?? suggested?.color ?? '#6321d6',
                    };
                  }),
                );
                assignPayment({ tags: names });
              }}
            />
          ) : null}
        </div>
      </div>

      {items && !skipped ? (
        <button
          type="button"
          onClick={() => setShowItems((v) => !v)}
          aria-expanded={showItems}
          aria-label={
            showItems ? 'Hide records' : `Show ${items.length} records`
          }
          className={cn(
            'flex shrink-0 items-center gap-0.5 rounded-full border border-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-accent hover:text-accent',
            showItems && 'border-accent text-accent',
          )}
        >
          {items.length} item{items.length === 1 ? '' : 's'}
          <ChevronDown
            size={11}
            strokeWidth={2.5}
            className={cn('transition-transform', showItems && 'rotate-180')}
          />
        </button>
      ) : null}

      {!skipped ? (
        <OccurrenceAttachments attachments={occ.attachments} label={occ.name} />
      ) : null}

      {occ.method && !skipped && !compact ? (
        <span
          className="hidden shrink-0 items-center gap-1 text-[11px] text-muted sm:flex"
          title={
            occ.bank ? `${occ.method.name} · ${occ.bank.name}` : occ.method.name
          }
        >
          <MethodIcon
            iconKey={occ.method.iconKey}
            logoUrl={occ.method.logoUrl}
            size={13}
          />
          {occ.bank ? (
            <span className="inline-flex items-center gap-1">
              {occ.bank.iconKey || occ.bank.logoUrl ? (
                <MethodIcon
                  iconKey={occ.bank.iconKey ?? 'bank'}
                  logoUrl={occ.bank.logoUrl}
                  size={12}
                />
              ) : (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: occ.bank.color }}
                />
              )}
              {occ.bank.name}
            </span>
          ) : null}
          {occ.recipientMethod ? (
            <span
              className="inline-flex items-center gap-1"
              style={{ color: occ.recipientMethod.color }}
            >
              <MethodIcon
                iconKey={occ.recipientMethod.iconKey}
                logoUrl={occ.recipientMethod.logoUrl}
                size={11}
              />
              {occ.recipientMethod.name}
            </span>
          ) : null}
        </span>
      ) : null}

      {occ.url && !skipped && !compact ? (
        <a
          href={occ.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open link for ${occ.name}`}
          className="hidden shrink-0 text-muted hover:text-ink sm:block"
        >
          <LinkIcon size={13} strokeWidth={2} />
        </a>
      ) : null}

      {compact ? null : (
        <span
          className={cn(
            'shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted',
            skipped ? 'inline' : 'hidden sm:inline',
          )}
        >
          {skipped ? 'Skipped' : RECURRENCE_LABEL[occ.recurrence]}
        </span>
      )}

      {(() => {
        const { primary, secondary } = formatConvertedParts(
          occ.amount,
          displayCurrency,
          rates,
        );
        return (
          <span
            className={cn(
              'flex shrink-0 flex-col items-end leading-tight',
              skipped && 'line-through decoration-2',
            )}
          >
            <span className="font-display text-sm font-semibold tabular-nums text-ink">
              {primary}
            </span>
            {secondary ? (
              <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted">
                {secondary}
              </span>
            ) : null}
          </span>
        );
      })()}

      {skipped ? (
        onEdit ? (
          <span className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden />
        ) : null
      ) : menuItems.length > 0 ? (
        <ActionMenu items={menuItems} label={`Actions for ${occ.name}`} />
      ) : null}
      </div>

      {flagNote && !skipped ? (
        <button
          type="button"
          onClick={() => onFlag?.(occ.paymentId, occ.dueDate)}
          className={cn(
            'flex w-full items-start gap-1.5 border-t border-danger/40 bg-danger/10 text-left text-xs text-danger',
            compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
          )}
        >
          <Flag size={12} strokeWidth={2.5} fill="currentColor" className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="whitespace-pre-wrap break-words">{flagNote}</span>
            {flagScope ? (
              <span className="ml-1 font-medium opacity-70">· {flagScope}</span>
            ) : null}
          </span>
        </button>
      ) : null}

      {items && showItems ? (
        <ul
          className={cn(
            'flex flex-col gap-1.5 border-t border-line/60',
            compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
          )}
        >
          {items.map((li) => (
            <li key={li.id} className="flex items-center gap-2 text-xs">
              <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface">
                {li.logoUrl ? (
                  <img
                    src={li.logoUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : li.iconKey ? (
                  <MethodIcon iconKey={li.iconKey} size={11} />
                ) : (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: li.color ?? 'var(--color-muted)' }}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-soft">
                {li.name}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted">
                {formatConverted(li.amount, displayCurrency, rates)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
