'use client';

import { useMemo, useState } from 'react';
import {
  RECURRENCES,
  actionTypesForTrigger,
  extractRecordSource,
  fieldSpec,
  fieldsForTrigger,
  operatorsForKind,
  templateVars,
  type AutomationActionType,
  type AutomationOperator,
  type AutomationTrigger,
  type NotifyChannel,
} from '@wib/domain';
import type { Automation } from '@wib/db';
import { ProviderPicker } from '@wib/feature-providers';
import { Button, Field, Input, Label, TagInput, cn } from '@wib/ui';
import {
  ACTION_HINTS,
  ACTION_LABELS,
  NOTIFY_CHANNEL_LABELS,
  OPERATOR_LABELS,
  RECORD_SOURCE_CHOICE_LABELS,
  TRIGGER_HINTS,
  TRIGGER_LABELS,
} from '../lib/labels';
import { toFormAction } from '../lib/schema';
import {
  runAutomationNowAction,
  saveAutomationAction,
} from '../lib/actions';
import type { AutomationLookups } from '../lib/queries';

const selectCls =
  'h-10 w-full rounded-md border border-line-strong bg-ground px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
  value2: string;
}
interface ActionRow {
  type: AutomationActionType;
  tags: string[];
  accountId: string;
  methodId: string;
  bankId: string;
  budgetId: string;
  providerId: string;
  value: string;
  channel: NotifyChannel;
  title: string;
  notes: string;
  message: string;
}

function TemplateChips({
  trigger,
  onInsert,
}: {
  trigger: AutomationTrigger;
  onInsert: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {templateVars(trigger).map((v) => (
        <button
          key={v.token}
          type="button"
          title={v.label}
          onClick={() => onInsert(`<${v.token}>`)}
          className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted hover:border-line-strong hover:text-ink"
        >
          {`<${v.token}>`}
        </button>
      ))}
    </div>
  );
}

const TRIGGERS: AutomationTrigger[] = ['review_expense_created', 'record_created'];
const DEFAULT_TRIGGER: AutomationTrigger = 'review_expense_created';
const FALLBACK_OPS: AutomationOperator[] = ['contains'];

function blankCondition(trigger: AutomationTrigger): ConditionRow {
  const f = fieldsForTrigger(trigger)[0];
  const ops = f ? operatorsForKind(f.kind) : FALLBACK_OPS;
  return {
    field: f?.field ?? 'name',
    operator: ops[0] ?? 'contains',
    value: '',
    value2: '',
  };
}
function blankAction(trigger: AutomationTrigger): ActionRow {
  return {
    type: actionTypesForTrigger(trigger)[0] ?? 'notify',
    tags: [],
    accountId: '',
    methodId: '',
    bankId: '',
    budgetId: '',
    providerId: '',
    value: '',
    channel: 'both',
    title: '',
    notes: '',
    message: '',
  };
}

export interface AutomationFormInitial {
  /** Omitted for a pre-filled *new* automation (e.g. "create from this card"). */
  id?: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: Automation['conditions'];
  actions: Automation['actions'];
}

export function AutomationForm({
  initial,
  lookups,
  hideTrigger = false,
  onDone,
  onCancel,
}: {
  initial?: AutomationFormInitial;
  lookups: AutomationLookups;
  /** Hide the "When" picker — the trigger is fixed by `initial` (e.g. opened
   * pre-filled from a payment / expense / review card). */
  hideTrigger?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    initial?.trigger ?? 'review_expense_created',
  );
  // Pull the reserved `source` scope out of a `record_created` rule's stored
  // conditions — it's edited via the toggle below, not as a pattern row.
  const initialSplit = initial
    ? extractRecordSource(initial.conditions)
    : null;
  const [recordSource, setRecordSource] = useState<
    'any' | 'manual' | 'automation'
  >(initialSplit?.source ?? 'any');
  const [conditions, setConditions] = useState<ConditionRow[]>(
    initialSplit
      ? (initialSplit.patterns.length > 0
          ? initialSplit.patterns
          : [blankCondition(initial?.trigger ?? DEFAULT_TRIGGER)]
        ).map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
          value2: c.value2 ?? '',
        }))
      : [blankCondition(DEFAULT_TRIGGER)],
  );
  const [actions, setActions] = useState<ActionRow[]>(
    initial
      ? initial.actions.map((a) => {
          const r = toFormAction(a);
          return {
            type: r.type,
            tags: r.tags ?? [],
            accountId: r.accountId ?? '',
            methodId: r.methodId ?? '',
            bankId: r.bankId ?? '',
            budgetId: r.budgetId ?? '',
            providerId: r.providerId ?? '',
            value: r.value ?? '',
            channel: r.channel ?? 'both',
            title: r.title ?? '',
            notes: r.notes ?? '',
            message: r.message ?? '',
          };
        })
      : [blankAction(DEFAULT_TRIGGER)],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [followUp, setFollowUp] = useState<{ id: string; count: number } | null>(
    null,
  );

  const fields = useMemo(() => fieldsForTrigger(trigger), [trigger]);
  const actionTypes = useMemo(() => actionTypesForTrigger(trigger), [trigger]);

  const switchTrigger = (t: AutomationTrigger) => {
    setTrigger(t);
    setConditions([blankCondition(t)]);
    setActions([blankAction(t)]);
    setRecordSource('any');
  };

  const enumOptions = (source?: string): string[] | null => {
    switch (source) {
      case 'direction':
        return ['out', 'in'];
      case 'kind':
        return ['payment', 'expense'];
      case 'recurrence':
        return [...RECURRENCES];
      case 'bank':
        return lookups.banks.map((b) => b.name);
      case 'account':
        return lookups.accounts.map((a) => a.name);
      default:
        return null;
    }
  };

  const setCond = (i: number, patch: Partial<ConditionRow>) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setAct = (i: number, patch: Partial<ActionRow>) =>
    setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const result = await saveAutomationAction(initial?.id ?? null, {
      name,
      trigger,
      recordSource: trigger === 'record_created' ? recordSource : 'any',
      conditions: conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        value2: c.value2,
      })),
      actions: actions.map((a) => ({
        type: a.type,
        tags: a.tags,
        accountId: a.accountId,
        methodId: a.methodId,
        bankId: a.bankId,
        budgetId: a.budgetId,
        providerId: a.providerId,
        value: a.value,
        channel: a.channel,
        title: a.title,
        notes: a.notes,
        message: a.message,
      })),
    });
    setBusy(false);
    if (!result.ok) {
      const first = result.fieldErrors
        ? Object.values(result.fieldErrors)[0]?.[0]
        : undefined;
      setError(result.error ?? first ?? 'Could not save the automation.');
      return;
    }
    if (
      result.item &&
      result.matchingExisting &&
      result.matchingExisting > 0
    ) {
      setFollowUp({ id: result.item.id, count: result.matchingExisting });
      return;
    }
    onDone();
  };

  const applyExisting = async (run: boolean) => {
    if (run && followUp) {
      setBusy(true);
      await runAutomationNowAction(followUp.id);
      setBusy(false);
    }
    onDone();
  };

  if (followUp) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">
          This automation matches{' '}
          <strong>
            {followUp.count} item{followUp.count === 1 ? '' : 's'}
          </strong>{' '}
          already waiting in your review inbox. Apply it to them now, or only to
          new ones from here on?
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void applyExisting(false)}
          >
            Only new items
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void applyExisting(true)}
          >
            {busy ? 'Applying…' : `Apply to ${followUp.count}`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Field>
        <Label htmlFor="automation-name">Name</Label>
        <Input
          id="automation-name"
          placeholder="Ignore small coffees"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      {hideTrigger ? (
        <p className="text-xs text-muted">{TRIGGER_HINTS[trigger]}</p>
      ) : (
      <Field>
        <Label>When</Label>
        <div className="flex flex-col gap-1.5">
          {TRIGGERS.map((t) => (
            <label
              key={t}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm',
                trigger === t
                  ? 'border-accent bg-accent/10'
                  : 'border-line-strong hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="trigger"
                className="mt-0.5 accent-accent"
                checked={trigger === t}
                onChange={() => switchTrigger(t)}
              />
              <span>
                <span className="font-medium text-ink">{TRIGGER_LABELS[t]}</span>
                <span className="block text-xs text-muted">
                  {TRIGGER_HINTS[t]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Field>
      )}

      {trigger === 'record_created' ? (
        <Field>
          <Label>Only when it was…</Label>
          <div className="flex flex-col gap-1.5">
            {(['any', 'manual', 'automation'] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  recordSource === s
                    ? 'border-accent bg-accent/10'
                    : 'border-line-strong hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="record-source"
                  className="accent-accent"
                  checked={recordSource === s}
                  onChange={() => setRecordSource(s)}
                />
                <span className="font-medium text-ink">
                  {RECORD_SOURCE_CHOICE_LABELS[s]}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            “Added by another automation” lets a rule act on payments/expenses
            that a review-inbox rule auto-filed for you.
          </p>
        </Field>
      ) : null}

      <Field>
        <div className="flex items-center justify-between">
          <Label>If all of these match</Label>
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            onClick={() =>
              setConditions((cs) => [...cs, blankCondition(trigger)])
            }
          >
            + Pattern
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {conditions.map((c, i) => {
            const spec = fieldSpec(trigger, c.field);
            const ops = spec ? operatorsForKind(spec.kind) : FALLBACK_OPS;
            const opts = enumOptions(spec?.enumSource);
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr] gap-2 rounded-md border border-line p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
              >
                <select
                  aria-label="Pattern field"
                  className={selectCls}
                  value={c.field}
                  onChange={(e) => {
                    const f = fieldSpec(trigger, e.target.value);
                    setCond(i, {
                      field: e.target.value,
                      operator: f
                        ? operatorsForKind(f.kind)[0] ?? 'contains'
                        : 'contains',
                      value: '',
                      value2: '',
                    });
                  }}
                >
                  {fields.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Condition"
                  className={selectCls}
                  value={c.operator}
                  onChange={(e) => setCond(i, { operator: e.target.value })}
                >
                  {ops.map((o) => (
                    <option key={o} value={o}>
                      {OPERATOR_LABELS[o]}
                    </option>
                  ))}
                </select>
                <div className="col-span-2 flex gap-2 sm:col-span-1">
                  {opts ? (
                    <select
                      aria-label="Value"
                      className={selectCls}
                      value={c.value}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {opts.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      aria-label="Value"
                      inputMode={spec?.kind === 'number' ? 'decimal' : 'text'}
                      placeholder={spec?.kind === 'number' ? '0.00' : 'value'}
                      value={c.value}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                    />
                  )}
                  {c.operator === 'between' ? (
                    <Input
                      aria-label="Upper bound"
                      inputMode="decimal"
                      placeholder="and"
                      value={c.value2}
                      onChange={(e) => setCond(i, { value2: e.target.value })}
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Remove pattern"
                  className="justify-self-end text-xs text-muted hover:text-danger"
                  onClick={() =>
                    setConditions((cs) =>
                      cs.length > 1 ? cs.filter((_, j) => j !== i) : cs,
                    )
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label>Then</Label>
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            onClick={() => setActions((as) => [...as, blankAction(trigger)])}
          >
            + Action
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {actions.map((a, i) => {
            const needsTags =
              a.type === 'add_tags' ||
              a.type === 'set_tags' ||
              a.type === 'log_expense' ||
              a.type === 'create_payment';
            const needsAccount =
              a.type === 'set_account' ||
              a.type === 'log_expense' ||
              a.type === 'create_payment';
            const needsMethod =
              a.type === 'set_method' || a.type === 'create_payment';
            const needsProvider =
              a.type === 'set_provider' || a.type === 'log_expense';
            const needsValue =
              a.type === 'set_name' || a.type === 'set_notes';
            return (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border border-line p-2"
              >
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Action"
                    className={selectCls}
                    value={a.type}
                    onChange={(e) =>
                      setAct(i, {
                        type: e.target.value as AutomationActionType,
                      })
                    }
                  >
                    {actionTypes.map((t) => (
                      <option key={t} value={t}>
                        {ACTION_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Remove action"
                    className="shrink-0 text-xs text-muted hover:text-danger"
                    onClick={() =>
                      setActions((as) =>
                        as.length > 1 ? as.filter((_, j) => j !== i) : as,
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                {ACTION_HINTS[a.type] ? (
                  <p className="text-[11px] text-muted">{ACTION_HINTS[a.type]}</p>
                ) : null}
                {needsValue ? (
                  <>
                    <Input
                      aria-label={
                        a.type === 'set_name' ? 'New title' : 'New description'
                      }
                      placeholder={
                        a.type === 'set_name'
                          ? 'e.g. Coffee | <title>'
                          : 'e.g. <amount> at <bank> on <date>'
                      }
                      value={a.value}
                      onChange={(e) => setAct(i, { value: e.target.value })}
                    />
                    <TemplateChips
                      trigger={trigger}
                      onInsert={(tok) => setAct(i, { value: a.value + tok })}
                    />
                  </>
                ) : null}
                {needsProvider ? (
                  <ProviderPicker
                    value={a.providerId || null}
                    providers={lookups.providers}
                    tags={lookups.tags.map((t) => ({
                      name: t.name,
                      color: t.color,
                    }))}
                    label={
                      a.type === 'set_provider'
                        ? 'Provider'
                        : 'Provider (optional)'
                    }
                    onChange={(id, defaultTagNames) => {
                      const patch: Partial<ActionRow> = {
                        providerId: id ?? '',
                      };
                      // log_expense has its own tags field — mirror the
                      // payment/expense forms and merge the provider's defaults.
                      if (a.type === 'log_expense' && defaultTagNames.length) {
                        const lower = new Set(
                          a.tags.map((t) => t.toLowerCase()),
                        );
                        patch.tags = [
                          ...a.tags,
                          ...defaultTagNames.filter(
                            (n) => !lower.has(n.toLowerCase()),
                          ),
                        ];
                      }
                      setAct(i, patch);
                    }}
                  />
                ) : null}
                {a.type === 'notify' ? (
                  <>
                    <select
                      aria-label="Notification channel"
                      className={selectCls}
                      value={a.channel}
                      onChange={(e) =>
                        setAct(i, {
                          channel: e.target.value as ActionRow['channel'],
                        })
                      }
                    >
                      {(
                        Object.keys(
                          NOTIFY_CHANNEL_LABELS,
                        ) as (keyof typeof NOTIFY_CHANNEL_LABELS)[]
                      ).map((c) => (
                        <option key={c} value={c}>
                          {NOTIFY_CHANNEL_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Notification title"
                      placeholder="Title (optional — defaults to the rule name)"
                      value={a.title}
                      onChange={(e) => setAct(i, { title: e.target.value })}
                    />
                    <Input
                      aria-label="Notification message"
                      placeholder="Message (optional, supports <tokens>)"
                      value={a.message}
                      onChange={(e) => setAct(i, { message: e.target.value })}
                    />
                    <TemplateChips
                      trigger={trigger}
                      onInsert={(tok) =>
                        setAct(i, { message: a.message + tok })
                      }
                    />
                  </>
                ) : null}
                {a.type === 'log_expense' || a.type === 'create_payment' ? (
                  <>
                    <Input
                      aria-label="Title"
                      placeholder={`Title (optional, e.g. "<title>")`}
                      value={a.title}
                      onChange={(e) => setAct(i, { title: e.target.value })}
                    />
                    <TemplateChips
                      trigger={trigger}
                      onInsert={(tok) => setAct(i, { title: a.title + tok })}
                    />
                    <Input
                      aria-label="Description"
                      placeholder="Description (optional, supports <tokens>)"
                      value={a.notes}
                      onChange={(e) => setAct(i, { notes: e.target.value })}
                    />
                    <TemplateChips
                      trigger={trigger}
                      onInsert={(tok) => setAct(i, { notes: a.notes + tok })}
                    />
                  </>
                ) : null}
                {needsTags ? (
                  <TagInput
                    value={a.tags}
                    onChange={(next) => setAct(i, { tags: next })}
                    options={lookups.tags.map((t) => ({
                      name: t.name,
                      color: t.color,
                    }))}
                  />
                ) : null}
                {needsAccount ? (
                  <select
                    aria-label="Account"
                    className={selectCls}
                    value={a.accountId}
                    onChange={(e) => setAct(i, { accountId: e.target.value })}
                  >
                    <option value="">
                      {a.type === 'set_account' ? 'Choose an account…' : 'No account'}
                    </option>
                    {lookups.accounts.map((ac) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {needsMethod ? (
                  <select
                    aria-label="Method"
                    className={selectCls}
                    value={a.methodId}
                    onChange={(e) => setAct(i, { methodId: e.target.value })}
                  >
                    <option value="">
                      {a.type === 'set_method' ? 'Choose a method…' : 'No method'}
                    </option>
                    {lookups.methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {a.type === 'log_expense' ? (
                  <>
                    <select
                      aria-label="Bank"
                      className={selectCls}
                      value={a.bankId}
                      onChange={(e) => setAct(i, { bankId: e.target.value })}
                    >
                      <option value="">Keep the source bank</option>
                      {lookups.banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Budget"
                      className={selectCls}
                      value={a.budgetId}
                      onChange={(e) => setAct(i, { budgetId: e.target.value })}
                    >
                      <option value="">No budget</option>
                      {lookups.budgets.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted">
                      {lookups.budgets.length > 0
                        ? 'Only recurring monthly budgets — each run files into that month’s envelope.'
                        : 'No recurring monthly budgets yet. A one-off budget can’t be used here — it would go stale next month.'}
                    </p>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy
            ? 'Saving…'
            : initial?.id
              ? 'Save changes'
              : 'Create automation'}
        </Button>
      </div>
    </form>
  );
}
