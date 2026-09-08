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
        <ul className="flex flex-col gap-2">
          {automations.map((a, i) => (
            <li
              key={a.id}
              className={cn(
                'rounded-xl border border-line bg-surface p-3',
                !a.enabled && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {a.name}
                  </p>
                  <p className="text-xs text-muted">
                    {TRIGGER_LABELS[a.trigger]}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-soft">
                    <span className="text-muted">If </span>
                    {describeConditions(a.trigger, a.conditions)}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {describeActions(a.actions, lookups).map((line, k) => (
                      <li
                        key={k}
                        className="flex gap-1.5 text-xs text-ink-soft"
                      >
                        <span className="select-none text-muted">→</span>
                        <span className="min-w-0">
                          {line.label}
                          {line.detail ? (
                            <span className="text-muted"> · {line.detail}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {lastRunLabel(a)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.enabled}
                    aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
                    disabled={pending}
                    onClick={async () => {
                      await toggleAutomationAction(a.id, !a.enabled);
                      refresh();
                    }}
                    className={cn(
                      'relative h-5 w-9 rounded-full transition-colors',
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
                  <div className="flex items-center gap-0.5 text-muted">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0 || pending}
                      onClick={() => void move(i, -1)}
                      className="rounded p-0.5 hover:text-ink disabled:opacity-30"
                    >
                      <ChevronUp />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === automations.length - 1 || pending}
                      onClick={() => void move(i, 1)}
                      className="rounded p-0.5 hover:text-ink disabled:opacity-30"
                    >
                      <ChevronDown />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 border-t border-line pt-2 text-xs">
                <button
                  type="button"
                  className="font-medium text-accent hover:underline"
                  onClick={() => setSheet({ mode: 'edit', item: a })}
                >
                  Edit
                </button>
                {a.trigger === 'review_expense_created' ? (
                  <button
                    type="button"
                    className="font-medium text-ink-soft hover:underline"
                    disabled={pending}
                    onClick={() => void runNow(a.id)}
                  >
                    Run on existing
                  </button>
                ) : null}
                <button
                  type="button"
                  className="font-medium text-muted hover:text-danger hover:underline"
                  disabled={pending}
                  onClick={async () => {
                    await deleteAutomationAction(a.id);
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
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

function ChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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
function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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
