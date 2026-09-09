import {
  RECORD_SOURCE_FIELD,
  fieldSpec,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
} from '@wib/domain';
import { ACTION_LABELS, NOTIFY_CHANNEL_LABELS, OPERATOR_LABELS } from './labels';
import type { AutomationLookups } from './queries';

/** Human one-liner for a rule's patterns, e.g. `Merchant name contains "Pret" and Amount is less than 5`. */
export function describeConditions(
  trigger: AutomationTrigger,
  conditions: AutomationCondition[],
): string {
  // The reserved `source` scope is shown as its own badge on the card.
  const patterns = conditions.filter((c) => c.field !== RECORD_SOURCE_FIELD);
  if (patterns.length === 0)
    return trigger === 'record_created' ? 'any record' : 'any transaction';
  return patterns.map((c) => describeCondition(trigger, c)).join(' and ');
}

function describeCondition(
  trigger: AutomationTrigger,
  c: AutomationCondition,
): string {
  const spec = fieldSpec(trigger, c.field);
  const field = spec?.label ?? c.field;
  const op = OPERATOR_LABELS[c.operator] ?? c.operator;
  const quote = (v: string) => (spec?.kind === 'text' ? `"${v}"` : v);
  if (c.operator === 'between') {
    return `${field} is between ${c.value} and ${c.value2 ?? ''}`.trim();
  }
  return `${field} ${op} ${quote(c.value)}`.trim();
}

export interface ActionLine {
  label: string;
  /** Short detail — the action's parameters in words. */
  detail?: string;
}

/** One `{ label, detail }` per action, in order, for the preview card. */
export function describeActions(
  actions: AutomationAction[],
  lookups: AutomationLookups,
): ActionLine[] {
  const accountName = (id?: string | null) =>
    id ? lookups.accounts.find((a) => a.id === id)?.name : undefined;
  const methodName = (id?: string | null) =>
    id ? lookups.methods.find((m) => m.id === id)?.name : undefined;
  const bankName = (id?: string | null) =>
    id ? lookups.banks.find((b) => b.id === id)?.name : undefined;
  const budgetName = (id?: string | null) =>
    id ? lookups.budgets.find((b) => b.id === id)?.name : undefined;
  const providerName = (id?: string | null) =>
    id ? lookups.providers.find((p) => p.id === id)?.name : undefined;

  return actions.map((a): ActionLine => {
    const label = ACTION_LABELS[a.type] ?? a.type;
    switch (a.type) {
      case 'ignore':
        return { label };
      case 'notify': {
        const bits = [NOTIFY_CHANNEL_LABELS[a.channel ?? 'both']];
        if (a.title) bits.push(`title “${a.title}”`);
        if (a.message) bits.push(`“${a.message}”`);
        return { label, detail: bits.join(' · ') };
      }
      case 'add_tags':
      case 'set_tags':
        return { label, detail: a.tags.join(', ') || '—' };
      case 'set_account':
        return { label, detail: accountName(a.accountId) ?? 'unknown account' };
      case 'set_method':
        return { label, detail: methodName(a.methodId) ?? 'unknown method' };
      case 'set_name':
      case 'set_notes':
        return { label, detail: `“${a.value}”` };
      case 'set_provider':
        return {
          label,
          detail: providerName(a.providerId) ?? 'unknown provider',
        };
      case 'log_expense': {
        const bits: string[] = [];
        if (a.name) bits.push(`title “${a.name}”`);
        if (a.notes) bits.push(`notes “${a.notes}”`);
        if (a.tags?.length) bits.push(`tags ${a.tags.join(', ')}`);
        const acc = accountName(a.accountId);
        if (acc) bits.push(acc);
        const bank = bankName(a.bankId);
        if (bank) bits.push(`bank ${bank}`);
        const budget = budgetName(a.budgetId);
        if (budget) bits.push(`budget ${budget}`);
        const provider = providerName(a.providerId);
        if (provider) bits.push(`provider ${provider}`);
        return { label, detail: bits.join(' · ') || undefined };
      }
      case 'create_payment': {
        const bits: string[] = [];
        if (a.name) bits.push(`title “${a.name}”`);
        if (a.notes) bits.push(`notes “${a.notes}”`);
        if (a.tags?.length) bits.push(`tags ${a.tags.join(', ')}`);
        const acc = accountName(a.accountId);
        if (acc) bits.push(acc);
        return { label, detail: bits.join(' · ') || undefined };
      }
      default:
        return { label };
    }
  });
}
