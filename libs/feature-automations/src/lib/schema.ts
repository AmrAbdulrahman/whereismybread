import {
  AUTOMATION_TRIGGERS,
  NOTIFY_CHANNELS,
  actionTypesForTrigger,
  fieldSpec,
  operatorsForKind,
  type AutomationAction,
  type AutomationActionType,
  type AutomationCondition,
  type AutomationTrigger,
  type NotifyChannel,
} from '@wib/domain';
import { z } from 'zod';

/** One pattern row as the form holds it. */
export const conditionSchema = z.object({
  field: z.string().min(1, 'Pick a field'),
  operator: z.string().min(1, 'Pick a condition'),
  value: z.string().trim().min(1, 'Enter a value'),
  value2: z.string().trim().optional().default(''),
});

/** One action row as the form holds it (flat — params vary by `type`). */
export const actionSchema = z.object({
  type: z.enum([
    'ignore',
    'notify',
    'log_expense',
    'create_payment',
    'add_tags',
    'set_account',
    'set_method',
    'set_tags',
    'set_name',
    'set_notes',
    'set_provider',
  ]),
  /** Tag names (log_expense / create_payment / add_tags / set_tags). */
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  accountId: z.string().optional().default(''),
  methodId: z.string().optional().default(''),
  bankId: z.string().optional().default(''),
  budgetId: z.string().optional().default(''),
  /** Reusable provider (log_expense / set_provider). */
  providerId: z.string().optional().default(''),
  /** Free text for set_name / set_notes. */
  value: z.string().optional().default(''),
  /** notify: where it delivers. */
  channel: z
    .enum(
      NOTIFY_CHANNELS as unknown as [NotifyChannel, ...NotifyChannel[]],
    )
    .optional()
    .default('both'),
  /** Custom title, templated (notify / log_expense / create_payment). */
  title: z.string().trim().max(200).optional().default(''),
  /** Custom description, templated (log_expense / create_payment). */
  notes: z.string().trim().max(1000).optional().default(''),
  /** notify: optional custom body (templated). */
  message: z.string().trim().max(1000).optional().default(''),
});

export const automationFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name this automation').max(120),
    trigger: z.enum(
      AUTOMATION_TRIGGERS as unknown as [AutomationTrigger, ...AutomationTrigger[]],
    ),
    // May be empty — an unconditional "runs for anything" rule.
    conditions: z.array(conditionSchema),
    actions: z.array(actionSchema).min(1, 'Add at least one action'),
    /**
     * `record_created` only: scope the rule to how the record was added.
     * `any` (default) → no scope condition is stored.
     */
    recordSource: z
      .enum(['any', 'manual', 'automation'])
      .optional()
      .default('any'),
  })
  .superRefine((v, ctx) => {
    const allowedActions = new Set(actionTypesForTrigger(v.trigger));
    v.actions.forEach((a, i) => {
      if (!allowedActions.has(a.type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'type'],
          message: 'That action does not apply to this event',
        });
      }
      if (
        (a.type === 'add_tags' || a.type === 'set_tags') &&
        a.tags.length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'tags'],
          message: 'Enter at least one tag',
        });
      }
      if (a.type === 'set_account' && !a.accountId) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'accountId'],
          message: 'Pick an account',
        });
      }
      if (a.type === 'set_method' && !a.methodId) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'methodId'],
          message: 'Pick a method',
        });
      }
      if (
        (a.type === 'set_name' || a.type === 'set_notes') &&
        !a.value.trim()
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'value'],
          message: 'Enter some text',
        });
      }
      if (a.type === 'set_provider' && !a.providerId) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'providerId'],
          message: 'Pick a provider',
        });
      }
    });
    v.conditions.forEach((c, i) => {
      const spec = fieldSpec(v.trigger, c.field);
      if (!spec) {
        ctx.addIssue({
          code: 'custom',
          path: ['conditions', i, 'field'],
          message: 'Unknown field',
        });
        return;
      }
      if (!operatorsForKind(spec.kind).includes(c.operator as never)) {
        ctx.addIssue({
          code: 'custom',
          path: ['conditions', i, 'operator'],
          message: 'That condition does not apply to this field',
        });
      }
      if (c.operator === 'between' && !c.value2?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['conditions', i, 'value2'],
          message: 'Enter an upper bound',
        });
      }
      if (spec.kind === 'number') {
        for (const [key, raw] of [
          ['value', c.value],
          ['value2', c.value2],
        ] as const) {
          if (key === 'value2' && c.operator !== 'between') continue;
          if (raw && !Number.isFinite(Number(raw.replace(/[, ]/g, '')))) {
            ctx.addIssue({
              code: 'custom',
              path: ['conditions', i, key],
              message: 'Enter a number',
            });
          }
        }
      }
    });
  });

export type AutomationFormValues = z.input<typeof automationFormSchema>;
export type AutomationFormParsed = z.output<typeof automationFormSchema>;

const cleanTags = (xs: string[]): string[] =>
  [...new Set(xs.map((s) => s.trim()).filter(Boolean))];

/** Turn a validated form action row into the stored `AutomationAction`. */
export function toStoredAction(a: AutomationFormParsed['actions'][number]): AutomationAction {
  switch (a.type) {
    case 'ignore':
      return { type: 'ignore' };
    case 'notify':
      return {
        type: 'notify',
        channel: a.channel,
        ...(a.title.trim() ? { title: a.title.trim() } : {}),
        ...(a.message.trim() ? { message: a.message.trim() } : {}),
      };
    case 'add_tags':
      return { type: 'add_tags', tags: cleanTags(a.tags) };
    case 'set_tags':
      return { type: 'set_tags', tags: cleanTags(a.tags) };
    case 'set_account':
      return { type: 'set_account', accountId: a.accountId };
    case 'set_method':
      return { type: 'set_method', methodId: a.methodId };
    case 'set_name':
      return { type: 'set_name', value: a.value.trim() };
    case 'set_notes':
      return { type: 'set_notes', value: a.value.trim() };
    case 'set_provider':
      return { type: 'set_provider', providerId: a.providerId };
    case 'log_expense':
      return {
        type: 'log_expense',
        tags: cleanTags(a.tags),
        accountId: a.accountId || null,
        bankId: a.bankId || null,
        budgetId: a.budgetId || null,
        providerId: a.providerId || null,
        name: a.title.trim() || null,
        notes: a.notes.trim() || null,
      };
    case 'create_payment':
      return {
        type: 'create_payment',
        tags: cleanTags(a.tags),
        accountId: a.accountId || null,
        name: a.title.trim() || null,
        notes: a.notes.trim() || null,
      };
    default: {
      const _exhaustive: never = a.type;
      throw new Error(`unknown action ${_exhaustive as string}`);
    }
  }
}

/** Turn a validated form condition row into the stored `AutomationCondition`. */
export function toStoredCondition(
  c: AutomationFormParsed['conditions'][number],
): AutomationCondition {
  return {
    field: c.field,
    operator: c.operator as AutomationCondition['operator'],
    value: c.value,
    ...(c.operator === 'between' && c.value2 ? { value2: c.value2 } : {}),
  };
}

/** Flatten a stored action back into the form row shape (for editing). */
export function toFormAction(
  a: AutomationAction,
): AutomationFormValues['actions'][number] {
  const base = {
    type: a.type as AutomationActionType,
    tags: [] as string[],
    accountId: '',
    methodId: '',
    bankId: '',
    budgetId: '',
    providerId: '',
    value: '',
    channel: 'both' as NotifyChannel,
    title: '',
    notes: '',
    message: '',
  };
  if (a.type === 'notify')
    return {
      ...base,
      channel: a.channel ?? 'both',
      title: a.title ?? '',
      message: a.message ?? '',
    };
  if (a.type === 'add_tags' || a.type === 'set_tags')
    return { ...base, tags: a.tags };
  if (a.type === 'set_account') return { ...base, accountId: a.accountId };
  if (a.type === 'set_method') return { ...base, methodId: a.methodId };
  if (a.type === 'set_name' || a.type === 'set_notes')
    return { ...base, value: a.value };
  if (a.type === 'set_provider')
    return { ...base, providerId: a.providerId };
  if (a.type === 'log_expense')
    return {
      ...base,
      tags: a.tags ?? [],
      accountId: a.accountId ?? '',
      bankId: a.bankId ?? '',
      budgetId: a.budgetId ?? '',
      providerId: a.providerId ?? '',
      title: a.name ?? '',
      notes: a.notes ?? '',
    };
  if (a.type === 'create_payment')
    return {
      ...base,
      tags: a.tags ?? [],
      accountId: a.accountId ?? '',
      title: a.name ?? '',
      notes: a.notes ?? '',
    };
  return base;
}
