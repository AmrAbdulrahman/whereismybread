import type {
  AutomationActionType,
  AutomationOperator,
  AutomationTrigger,
  NotifyChannel,
} from '@wib/domain';

export const NOTIFY_CHANNEL_LABELS: Record<NotifyChannel, string> = {
  both: 'In-app + email',
  in_app: 'In-app only',
  email: 'Email only',
};

/** The `record_created` source-scope toggle (`any` = no scope). */
export const RECORD_SOURCE_CHOICE_LABELS: Record<
  'any' | 'manual' | 'automation',
  string
> = {
  any: 'Added any way',
  manual: 'Added manually',
  automation: 'Added by another automation',
};

/** Compact form for the automations list card (only shown when scoped). */
export const RECORD_SOURCE_BADGE_LABELS: Record<
  'manual' | 'automation',
  string
> = {
  manual: 'Manual only',
  automation: 'Automation only',
};

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  review_expense_created: 'An expense for review is created',
  record_created: 'A payment or expense is added',
};

export const TRIGGER_HINTS: Record<AutomationTrigger, string> = {
  review_expense_created:
    'Runs when a transaction comes in from bank sync or a statement upload.',
  record_created:
    'Runs when you add a planned payment or record an expense.',
};

export const OPERATOR_LABELS: Record<AutomationOperator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  matches: 'matches (regex)',
  equals: 'equals',
  is: 'is',
  is_not: 'is not',
  lt: 'is less than',
  lte: 'is at most',
  gt: 'is more than',
  gte: 'is at least',
  between: 'is between',
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  ignore: 'Ignore the expense',
  log_expense: 'Log it as an expense',
  create_payment: 'Create a one-time payment',
  add_tags: 'Add tags',
  set_account: 'Set the account',
  set_method: 'Set the payment method',
  set_tags: 'Set tags',
  set_name: 'Set the title',
  set_notes: 'Set the description',
  set_provider: 'Set the provider',
  notify: 'Send a notification',
};

export const ACTION_HINTS: Partial<Record<AutomationActionType, string>> = {
  ignore: 'The transaction is marked ignored and leaves the review inbox.',
  log_expense: 'A recorded expense is created from the transaction.',
  create_payment: 'A one-time planned payment is created from the transaction.',
  notify:
    'Leaves a note in-app and/or emails you. Title + message support <tokens>.',
  set_tags: 'Tags carried onto the payment/expense when you triage it.',
  set_account: 'Account carried onto the payment/expense when you triage it.',
  set_method:
    'Method carried onto the payment when you triage it (payments only).',
  set_name: 'Replaces the merchant name shown and prefilled.',
  set_notes: 'Replaces the description prefilled into notes.',
  set_provider:
    'The provider (with its icon, colour and default tags) carried onto the expense when you triage it.',
};
