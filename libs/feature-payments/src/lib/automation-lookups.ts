import type { Account, Bank, PaymentMethod, Provider, Tag } from '@wib/db';
import type {
  AutomationFormInitial,
  AutomationLookups,
} from '@wib/feature-automations';
import type { BudgetSummary } from './types';

/**
 * Build the lookup lists the `<AutomationForm>` needs from data the plan /
 * integrations pages already load — so "Create automation from this card"
 * doesn't need its own server round trip.
 *
 * Budgets are narrowed to recurring monthly series (one entry each, anchored
 * on the earliest instance id — stable as later months materialise); the
 * engine resolves the right month's instance when a rule fires.
 */
export function buildAutomationLookups(input: {
  accounts: Pick<Account, 'id' | 'name' | 'color'>[];
  banks: Pick<Bank, 'id' | 'name' | 'color'>[];
  methods: Pick<PaymentMethod, 'id' | 'name'>[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
  providers?: Pick<Provider, 'id' | 'name' | 'logoUrl' | 'color'>[];
  budgets: BudgetSummary[];
}): AutomationLookups {
  const byName = new Map<
    string,
    { id: string; name: string; startDate: string }
  >();
  for (const b of input.budgets) {
    if (!b.recurring || b.closedAt) continue;
    const key = b.name.toLowerCase();
    const cur = byName.get(key);
    if (!cur || b.startDate < cur.startDate) {
      byName.set(key, { id: b.id, name: b.name, startDate: b.startDate });
    }
  }
  return {
    accounts: input.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
    })),
    banks: input.banks.map((b) => ({ id: b.id, name: b.name, color: b.color })),
    methods: input.methods.map((m) => ({ id: m.id, name: m.name })),
    tags: input.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    providers: (input.providers ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      logoUrl: p.logoUrl,
      color: p.color,
    })),
    budgets: [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name })),
  };
}

/** The pre-filled draft for "create automation from this row" — matches by
 * name + amount, on the review-expense trigger. */
export function automationDraftFor(
  name: string,
  amountMinor: number,
): AutomationFormInitial {
  return {
    name: `Auto-file ${name}`.slice(0, 80),
    trigger: 'review_expense_created' as const,
    conditions: [
      { field: 'name', operator: 'contains' as const, value: name },
      {
        field: 'amount',
        operator: 'equals' as const,
        value: (Math.abs(amountMinor) / 100).toFixed(2),
      },
    ],
    actions: [],
  };
}
