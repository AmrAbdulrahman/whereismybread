'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Automation } from '@wib/db';
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { TRIGGER_LABELS } from '../lib/labels';
import { describeActions, describeConditions } from '../lib/describe';
import {
  deleteAutomationAction,
  reorderAutomationsAction,
  runAutomationNowAction,
  toggleAutomationAction,
} from '../lib/actions';
import { AutomationForm, type AutomationFormInitial } from './automation-form';
import type { AutomationLookups } from '../lib/queries';

function lastRunLabel(a: Automation): string {
  if (!a.lastRunAt) return 'Never run';
  const d = new Date(a.lastRunAt);
  return `Ran ${d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })} · ${a.runCount} total`;
}

export function AutomationsView({
  automations,
  lookups,
}: {
  automations: Automation[];
  lookups: AutomationLookups;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<
    { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; item: Automation }
  >({ mode: 'closed' });
  const [note, setNote] = useState<string>();
  // Cards start collapsed — the header (name + trigger + on/off) is enough to
  // scan the list; expand one to see its conditions / actions / controls.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const refresh = () => startTransition(() => router.refresh());

  const editInitial = (a: Automation): AutomationFormInitial => ({
    id: a.id,
    name: a.name,
    trigger: a.trigger,
    conditions: a.conditions,
    actions: a.actions,
  });

  const runNow = async (id: string) => {
    const res = await runAutomationNowAction(id);
    setNote(res.message);
    refresh();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= automations.length) return;
    const ids = automations.map((a) => a.id);
    const moved = ids.splice(index, 1);
    ids.splice(j, 0, ...moved);
    await reorderAutomationsAction(ids);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Rules that run when a review expense arrives or you add a payment.
        </p>
        <Button type="button" onClick={() => setSheet({ mode: 'new' })}>
          New automation
        </Button>
      </div>

      {note ? (
        <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-soft">
          {note}
        </p>
      ) : null}

      {automations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">No automations yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Create one to auto-tag, auto-file, ignore, or get notified about
            matching transactions and payments.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {automations.map((a, i) => {
            const isOpen = expanded.has(a.id);
            return (
            <li
              key={a.id}
              className={cn(
                'overflow-hidden rounded-xl border bg-surface shadow-sm transition-colors',
                a.enabled ? 'border-line-strong' : 'border-line',
              )}
            >
              {/* Header: click to expand/collapse. Name + trigger + on/off. */}
              <div className="flex items-start gap-2 px-3 py-3 sm:px-3.5">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${a.name}`}
                  onClick={() => toggleExpanded(a.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <ChevronDown
                    className={cn(
                      'mt-0.5 shrink-0 text-muted transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span
                      className={cn(
                        'truncate text-sm font-semibold',
                        a.enabled ? 'text-ink' : 'text-ink-soft',
                      )}
                    >
                      {a.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            a.trigger === 'review_expense_created'
                              ? 'bg-teal'
                              : 'bg-accent',
                          )}
                        />
                        {TRIGGER_LABELS[a.trigger]}
                      </span>
                      {!a.enabled ? (
                        <span className="rounded-full bg-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          Off
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={a.enabled}
                  aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
                  disabled={pending}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await toggleAutomationAction(a.id, !a.enabled);
                    refresh();
                  }}
                  className={cn(
                    'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
                    a.enabled ? 'bg-accent' : 'bg-line-strong',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-ground transition-all',
                      a.enabled ? 'left-4' : 'left-0.5',
                    )}
                  />
                </button>
              </div>

              {isOpen ? (
                <>
              {/* If — the match conditions */}
              <div
                className={cn(
                  'border-t border-line px-3.5 py-2.5',
                  !a.enabled && 'opacity-60',
                )}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  If
                </p>
                <p className="text-xs text-ink-soft">
                  {describeConditions(a.trigger, a.conditions)}
                </p>
              </div>

              {/* Then — the actions it runs */}
              <div
                className={cn(
                  'border-t border-line px-3.5 py-2.5',
                  !a.enabled && 'opacity-60',
                )}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Then
                </p>
                <ul className="flex flex-col gap-1">
                  {describeActions(a.actions, lookups).map((line, k) => (
                    <li
                      key={k}
                      className="flex items-start gap-2 text-xs text-ink-soft"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      <span className="min-w-0">
                        <span className="font-medium text-ink">
                          {line.label}
                        </span>
                        {line.detail ? (
                          <span className="text-muted"> · {line.detail}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Footer: last run + controls */}
              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/40 px-3.5 py-2">
                <span className="truncate text-[11px] text-muted">
                  {lastRunLabel(a)}
                </span>
                <div className="flex shrink-0 items-center gap-1 text-xs">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0 || pending}
                    onClick={() => void move(i, -1)}
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                  >
                    <ChevronUp />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === automations.length - 1 || pending}
                    onClick={() => void move(i, 1)}
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                  >
                    <ChevronDown />
                  </button>
                  <span className="mx-1 h-4 w-px bg-line" />
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 font-medium text-accent hover:underline"
                    onClick={() => setSheet({ mode: 'edit', item: a })}
                  >
                    Edit
                  </button>
                  {a.trigger === 'review_expense_created' ? (
                    <button
                      type="button"
                      className="rounded px-1.5 py-1 font-medium text-ink-soft hover:underline"
                      disabled={pending}
                      onClick={() => void runNow(a.id)}
                    >
                      Run
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 font-medium text-muted hover:text-danger hover:underline"
                    disabled={pending}
                    onClick={async () => {
                      await deleteAutomationAction(a.id);
                      refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
                </>
              ) : null}
            </li>
            );
          })}
        </ul>
      )}

      <ResponsiveModal
        open={sheet.mode !== 'closed'}
        onOpenChange={(o) => !o && setSheet({ mode: 'closed' })}
        title={sheet.mode === 'edit' ? 'Edit automation' : 'New automation'}
      >
        {sheet.mode !== 'closed' ? (
          <AutomationForm
            initial={
              sheet.mode === 'edit' ? editInitial(sheet.item) : undefined
            }
            lookups={lookups}
            onDone={() => {
              setSheet({ mode: 'closed' });
              refresh();
            }}
            onCancel={() => setSheet({ mode: 'closed' })}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}

function ChevronUp({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="m6 15 6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
