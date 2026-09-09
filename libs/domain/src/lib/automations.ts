/**
 * Pure matching core for the Automations feature. No DB, no I/O — just the
 * shapes a rule is stored in and the logic that decides whether a rule's
 * patterns match a given subject (a bank transaction awaiting review, or a
 * freshly-created payment / expense).
 *
 * A rule is: Event (trigger) → Patterns (conditions, combined with AND) →
 * Actions. This module owns the trigger/field/operator vocabulary and
 * `evaluateConditions`; the engine (server-side, in feature-automations) owns
 * running the actions.
 */

/** What kind of thing sets a rule off. */
export type AutomationTrigger = 'review_expense_created' | 'record_created';

export const AUTOMATION_TRIGGERS: readonly AutomationTrigger[] = [
  'review_expense_created',
  'record_created',
] as const;

/**
 * How a payment / expense came to exist — the `record_created` trigger can be
 * scoped to one of these. `manual` = the user added it by hand (incl. triaging
 * a bank transaction); `automation` = the engine auto-filed it from a
 * `review_expense_created` rule's `log_expense` / `create_payment` action.
 */
export type RecordSource = 'manual' | 'automation';
export const RECORD_SOURCES: readonly RecordSource[] = [
  'manual',
  'automation',
] as const;

/**
 * Reserved condition field on a `record_created` rule: `{ field: 'source',
 * operator: 'is', value: 'manual' | 'automation' }`. Absent → the rule fires
 * for either source. Surfaced in the editor as a dedicated toggle rather than
 * a pattern row, but stored as a normal condition so `evaluateConditions`
 * filters on it for free.
 */
export const RECORD_SOURCE_FIELD = 'source';

export type AutomationOperator =
  | 'contains'
  | 'not_contains'
  | 'matches'
  | 'equals'
  | 'is'
  | 'is_not'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between';

/** One pattern line. `value2` is only read by `between`. */
export interface AutomationCondition {
  field: string;
  operator: AutomationOperator;
  value: string;
  value2?: string;
}

/** Where a `notify` action delivers. Absent → `both` (back-compat). */
export type NotifyChannel = 'in_app' | 'email' | 'both';
export const NOTIFY_CHANNELS: readonly NotifyChannel[] = [
  'both',
  'in_app',
  'email',
] as const;

/**
 * The actions a rule can carry. `ignore` / `log_expense` / `create_payment`
 * are terminal for a review-expense subject (they consume it); the rest layer.
 */
export type AutomationAction =
  | { type: 'ignore' }
  | {
      type: 'notify';
      channel?: NotifyChannel;
      /** Optional custom title (templated). Absent → the automation's name. */
      title?: string;
      /** Optional custom body (templated). Absent → an auto-generated summary. */
      message?: string;
    }
  | {
      type: 'log_expense';
      tags?: string[];
      accountId?: string | null;
      bankId?: string | null;
      budgetId?: string | null;
      /** The reusable service provider to attach to the expense. */
      providerId?: string | null;
      /** Title / notes (templated). Absent → the merchant name / raw description. */
      name?: string | null;
      notes?: string | null;
    }
  | {
      type: 'create_payment';
      tags?: string[];
      accountId?: string | null;
      name?: string | null;
      notes?: string | null;
    }
  | { type: 'add_tags'; tags: string[] }
  | { type: 'set_account'; accountId: string }
  | { type: 'set_method'; methodId: string }
  // Review-event enrich actions — stamp the pending transaction so the
  // payment/expense form inherits it on triage.
  | { type: 'set_tags'; tags: string[] }
  | { type: 'set_name'; value: string }
  | { type: 'set_notes'; value: string }
  | { type: 'set_provider'; providerId: string };

export type AutomationActionType = AutomationAction['type'];

/** Action types that consume a review-expense subject — at most one runs. */
export const TERMINAL_ACTION_TYPES: readonly AutomationActionType[] = [
  'ignore',
  'log_expense',
  'create_payment',
] as const;

export function isTerminalAction(type: AutomationActionType): boolean {
  return (TERMINAL_ACTION_TYPES as readonly string[]).includes(type);
}

/** The flat bag of values a condition is tested against. */
export type AutomationSubject = Record<
  string,
  string | number | null | undefined
>;

// --- Field catalogue (drives the rule editor + validation) --------------------

export type AutomationFieldKind = 'text' | 'number' | 'enum';

export interface AutomationFieldSpec {
  field: string;
  label: string;
  kind: AutomationFieldKind;
  /** For `enum`: where the option list comes from (resolved by the UI). */
  enumSource?: 'direction' | 'bank' | 'account' | 'method' | 'kind' | 'recurrence';
}

const TEXT_OPS: AutomationOperator[] = [
  'contains',
  'not_contains',
  'matches',
  'equals',
];
const NUMBER_OPS: AutomationOperator[] = [
  'lt',
  'lte',
  'gt',
  'gte',
  'between',
  'equals',
];
const ENUM_OPS: AutomationOperator[] = ['is', 'is_not'];

export function operatorsForKind(
  kind: AutomationFieldKind,
): AutomationOperator[] {
  if (kind === 'number') return [...NUMBER_OPS];
  if (kind === 'enum') return [...ENUM_OPS];
  return [...TEXT_OPS];
}

const REVIEW_FIELDS: AutomationFieldSpec[] = [
  { field: 'name', label: 'Merchant name', kind: 'text' },
  { field: 'description', label: 'Raw description', kind: 'text' },
  { field: 'amount', label: 'Amount', kind: 'number' },
  {
    field: 'direction',
    label: 'Direction',
    kind: 'enum',
    enumSource: 'direction',
  },
  { field: 'currency', label: 'Currency', kind: 'text' },
  { field: 'bank', label: 'Bank', kind: 'enum', enumSource: 'bank' },
  { field: 'rawType', label: 'Transaction type', kind: 'text' },
];

const RECORD_FIELDS: AutomationFieldSpec[] = [
  { field: 'kind', label: 'Record type', kind: 'enum', enumSource: 'kind' },
  { field: 'name', label: 'Name', kind: 'text' },
  { field: 'amount', label: 'Amount', kind: 'number' },
  { field: 'currency', label: 'Currency', kind: 'text' },
  {
    field: 'recurrence',
    label: 'Recurrence',
    kind: 'enum',
    enumSource: 'recurrence',
  },
  { field: 'account', label: 'Account', kind: 'enum', enumSource: 'account' },
  { field: 'method', label: 'Method', kind: 'enum', enumSource: 'method' },
];

export function fieldsForTrigger(
  trigger: AutomationTrigger,
): AutomationFieldSpec[] {
  return trigger === 'review_expense_created' ? REVIEW_FIELDS : RECORD_FIELDS;
}

export function fieldSpec(
  trigger: AutomationTrigger,
  field: string,
): AutomationFieldSpec | undefined {
  return fieldsForTrigger(trigger).find((f) => f.field === field);
}

/** Action types offered for each trigger, in menu order. */
export function actionTypesForTrigger(
  trigger: AutomationTrigger,
): AutomationActionType[] {
  return trigger === 'review_expense_created'
    ? [
        'set_tags',
        'set_account',
        'set_method',
        'set_provider',
        'set_name',
        'set_notes',
        'log_expense',
        'create_payment',
        'ignore',
        'notify',
      ]
    : ['add_tags', 'set_account', 'set_method', 'notify'];
}

// --- Templates -------------------------------------------------------------

/** A `<token>` you can drop into a title / description / notification body. */
export interface TemplateVar {
  token: string;
  label: string;
}

const REVIEW_VARS: TemplateVar[] = [
  { token: 'title', label: 'Original title' },
  { token: 'description', label: 'Raw description' },
  { token: 'amount', label: 'Amount' },
  { token: 'currency', label: 'Currency' },
  { token: 'direction', label: 'Direction' },
  { token: 'bank', label: 'Bank' },
  { token: 'type', label: 'Transaction type' },
  { token: 'date', label: 'Date' },
];

const RECORD_VARS: TemplateVar[] = [
  { token: 'name', label: 'Name' },
  { token: 'amount', label: 'Amount' },
  { token: 'currency', label: 'Currency' },
  { token: 'kind', label: 'Record type' },
  { token: 'account', label: 'Account' },
  { token: 'method', label: 'Method' },
  { token: 'recurrence', label: 'Recurrence' },
  { token: 'date', label: 'Date' },
];

export function templateVars(trigger: AutomationTrigger): TemplateVar[] {
  return trigger === 'review_expense_created' ? REVIEW_VARS : RECORD_VARS;
}

/**
 * Replace `<token>` placeholders with values (case-insensitive). Unknown
 * tokens are left untouched so a stray `<foo>` is visible, not silently eaten.
 */
export function applyTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/<([a-z0-9_]+)>/gi, (whole, key: string) => {
    const found = Object.entries(vars).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    );
    if (!found) return whole;
    const v = found[1];
    return v === null || v === undefined ? '' : String(v);
  });
}

// --- Evaluation --------------------------------------------------------------

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[, ]/g, ''));
  return n;
}

function asText(v: unknown): string {
  return String(v ?? '');
}

/** A defensively-compiled matcher: regex when it compiles, literal otherwise. */
function textTest(pattern: string): (s: string) => boolean {
  const needle = pattern.trim();
  try {
    const re = new RegExp(needle, 'i');
    return (s) => re.test(s);
  } catch {
    const lower = needle.toLowerCase();
    return (s) => s.toLowerCase().includes(lower);
  }
}

export function conditionMatches(
  cond: AutomationCondition,
  subject: AutomationSubject,
): boolean {
  const raw = subject[cond.field];
  const present = raw !== undefined && raw !== null && raw !== '';

  switch (cond.operator) {
    case 'not_contains':
      return !present || !asText(raw).toLowerCase().includes(
        cond.value.trim().toLowerCase(),
      );
    case 'is_not':
      return (
        !present ||
        asText(raw).trim().toLowerCase() !== cond.value.trim().toLowerCase()
      );
    default:
      break;
  }

  if (!present) return false;

  switch (cond.operator) {
    case 'contains':
      return asText(raw)
        .toLowerCase()
        .includes(cond.value.trim().toLowerCase());
    case 'matches':
      return textTest(cond.value)(asText(raw));
    case 'equals': {
      const t = asText(raw).trim();
      if (t.toLowerCase() === cond.value.trim().toLowerCase()) return true;
      // numeric equality (amount)
      const a = asNumber(raw);
      const b = asNumber(cond.value);
      return Number.isFinite(a) && Number.isFinite(b) && a === b;
    }
    case 'is':
      return (
        asText(raw).trim().toLowerCase() === cond.value.trim().toLowerCase()
      );
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const a = asNumber(raw);
      const b = asNumber(cond.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (cond.operator === 'lt') return a < b;
      if (cond.operator === 'lte') return a <= b;
      if (cond.operator === 'gt') return a > b;
      return a >= b;
    }
    case 'between': {
      const a = asNumber(raw);
      const lo = asNumber(cond.value);
      const hi = asNumber(cond.value2 ?? '');
      if (![a, lo, hi].every(Number.isFinite)) return false;
      return a >= Math.min(lo, hi) && a <= Math.max(lo, hi);
    }
    default:
      return false;
  }
}

/**
 * Split a `record_created` rule's stored conditions into the reserved `source`
 * scope and the real pattern rows. Safe to call for any trigger — a
 * `review_expense_created` rule has no `source` field, so `source` is `null`
 * and every condition is returned as a pattern.
 */
export function extractRecordSource(conditions: AutomationCondition[]): {
  source: RecordSource | null;
  patterns: AutomationCondition[];
} {
  let source: RecordSource | null = null;
  const patterns: AutomationCondition[] = [];
  for (const c of conditions ?? []) {
    if (
      c.field === RECORD_SOURCE_FIELD &&
      (c.value === 'manual' || c.value === 'automation')
    ) {
      source = c.value;
    } else {
      patterns.push(c);
    }
  }
  return { source, patterns };
}

/** AND across every condition. An empty list never matches. */
export function evaluateConditions(
  conditions: AutomationCondition[],
  subject: AutomationSubject,
): boolean {
  if (!conditions || conditions.length === 0) return false;
  return conditions.every((c) => conditionMatches(c, subject));
}

// --- Bank-sync summary ----------------------------------------------------

/** What one bank sync did, once its review automations have run. */
export interface SyncSummary {
  /** New transactions this sync brought in (before any were auto-handled). */
  pulled: number;
  /** Turned into planned payments by a `create_payment` automation. */
  paymentsCreated: number;
  /** Logged as expenses by a `log_expense` automation. */
  expensesCreated: number;
  /** Dropped by an ignore rule or an `ignore` automation. */
  autoIgnored: number;
  /** Still sitting in the review inbox. */
  needsReview: number;
}

/**
 * One-line recap for the "sync finished" notification, e.g.
 * "10 transactions pulled, 2 payments automatically created,
 *  4 expenses automatically created, 4 need your review".
 * Zero-count clauses are dropped; the review clause is always kept.
 */
export function formatSyncSummary(s: SyncSummary): string {
  const n = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;
  const parts = [`${n(s.pulled, 'transaction')} pulled`];
  if (s.paymentsCreated > 0)
    parts.push(`${n(s.paymentsCreated, 'payment')} automatically created`);
  if (s.expensesCreated > 0)
    parts.push(`${n(s.expensesCreated, 'expense')} automatically created`);
  if (s.autoIgnored > 0) parts.push(`${s.autoIgnored} auto-ignored`);
  parts.push(
    `${s.needsReview} ${s.needsReview === 1 ? 'needs' : 'need'} your review`,
  );
  return parts.join(', ');
}
