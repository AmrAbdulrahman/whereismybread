import 'server-only';

import { findUserById } from '@wib/db';
import { sendAutomationNotificationEmail } from '@wib/auth/server';
import {
  addExpenseTags,
  addPaymentTags,
  createExpense,
  createNotifications,
  createPayment,
  fetchBranding,
  getBankTransactionsByIds,
  getOrCreateTags,
  listAccounts,
  listBanks,
  listEnabledAutomations,
  listPaymentMethods,
  listPendingBankTransactions,
  markBankTransactionCategorized,
  markBankTransactionIgnored,
  markOccurrence,
  resolveBudgetForDate,
  setExpenseAccount,
  setPaymentAccount,
  setPaymentMethod,
  touchAutomationRun,
  updateBankTransactionEnrichment,
  type Automation,
  type BankTransaction,
  type NotificationInput,
} from '@wib/db';
import {
  applyTemplate,
  cleanMerchant,
  evaluateConditions,
  formatMoney,
  formatSyncSummary,
  isTerminalAction,
  money,
  type AutomationAction,
  type AutomationSubject,
  type NotifyChannel,
  type SyncSummary,
} from '@wib/domain';
import { sendPushToUser } from './push';
import { buildRecordSubject, buildReviewSubject } from './subject';

type TemplateVars = Record<string, string>;

const REVIEW_HREF = '/integrations';
const RECORD_HREF = '/plan';

// --- Subjects --------------------------------------------------------------

function reviewSubject(
  txn: BankTransaction,
  bankNames: Map<string, string>,
): AutomationSubject {
  return buildReviewSubject({
    description: txn.description,
    rawType: txn.rawType,
    amountMinor: txn.amountMinor,
    currency: txn.currency,
    bankName: txn.bankId ? bankNames.get(txn.bankId) ?? '' : '',
  });
}

/** `<token>` values for a review transaction's title / notes / notification. */
function reviewTemplateVars(
  txn: BankTransaction,
  bankNames: Map<string, string>,
): TemplateVars {
  const merchant =
    cleanMerchant(txn.description, txn.rawType) || txn.description;
  return {
    title: merchant,
    name: merchant,
    description: txn.description,
    amount: formatMoney(money(Math.abs(txn.amountMinor), txn.currency)),
    currency: txn.currency,
    direction: txn.amountMinor < 0 ? 'out' : 'in',
    bank: txn.bankId ? bankNames.get(txn.bankId) ?? '' : '',
    type: txn.rawType ?? '',
    date: txn.occurredAt.toISOString().slice(0, 10),
  };
}

export interface RecordSubjectInput {
  kind: 'payment' | 'expense';
  recordId: string;
  name: string;
  amountMinor: number;
  currency: string;
  recurrence?: string | null;
  accountId?: string | null;
  methodId?: string | null;
}

async function recordSubject(
  userId: string,
  input: RecordSubjectInput,
  needsAccount: boolean,
  needsMethod: boolean,
): Promise<AutomationSubject> {
  let account = '';
  let method = '';
  if (needsAccount && input.accountId) {
    account =
      (await listAccounts(userId)).find((a) => a.id === input.accountId)?.name ??
      '';
  }
  if (needsMethod && input.methodId) {
    method =
      (await listPaymentMethods(userId)).find((m) => m.id === input.methodId)
        ?.name ?? '';
  }
  return buildRecordSubject({
    kind: input.kind,
    name: input.name,
    amountMinor: input.amountMinor,
    currency: input.currency,
    recurrence: input.recurrence,
    accountName: account,
    methodName: method,
  });
}

// --- Notification / email fan-out ----------------------------------------

/** The user's delivery preferences, resolved once per engine run. */
interface NotifyContext {
  email: string | null;
  /** `notify_email` — false mutes automation notification emails. */
  emailEnabled: boolean;
}

async function loadNotifyContext(userId: string): Promise<NotifyContext> {
  const user = await findUserById(userId).catch(() => null);
  return {
    email: user?.email ?? null,
    emailEnabled: user?.notifyEmail ?? true,
  };
}

/**
 * Deliver a batch of notices over one channel. In-app notices are also pushed
 * to the browser (best-effort, no-op without a subscription); email is gated
 * on the user's `notify_email` preference.
 */
async function deliver(
  userId: string,
  ctx: NotifyContext,
  channel: NotifyChannel,
  notices: NotificationInput[],
): Promise<void> {
  if (notices.length === 0) return;
  if (channel === 'in_app' || channel === 'both') {
    await createNotifications(userId, notices);
    await sendPushToUser(userId, notices);
  }
  if ((channel === 'email' || channel === 'both') && ctx.email && ctx.emailEnabled) {
    for (const n of notices) {
      await sendAutomationNotificationEmail(ctx.email, {
        title: n.title,
        body: n.body ?? '',
        path: n.href ?? null,
      });
    }
  }
}

/** The `notify` action on an automation, if it has one. */
function notifyAction(
  auto: Automation,
): Extract<AutomationAction, { type: 'notify' }> | undefined {
  return auto.actions.find(
    (a): a is Extract<AutomationAction, { type: 'notify' }> =>
      a.type === 'notify',
  );
}

// --- Review-expense actions --------------------------------------------

/** Triage hints accumulated for one transaction as its matching rules run. */
interface Stamp {
  name?: string;
  notes?: string;
  accountId: string | null;
  methodId: string | null;
  tags: string[];
  url: string | null;
  logoUrl: string | null;
  brandColor: string | null;
}

function initStamp(txn: BankTransaction): Stamp {
  return {
    name: txn.nameOverride ?? undefined,
    notes: txn.notesOverride ?? undefined,
    accountId: txn.triageAccountId,
    methodId: txn.triageMethodId,
    tags: [...txn.tags],
    url: txn.url,
    logoUrl: txn.logoUrl,
    brandColor: txn.brandColor,
  };
}

const uniq = (xs: string[]) => [...new Set(xs.map((s) => s.trim()).filter(Boolean))];

/**
 * A non-terminal "enrich" action for the review event — stamps the pending
 * row and folds the change into `stamp` so a later terminal action inherits it.
 */
async function applyReviewEnrich(
  userId: string,
  txnId: string,
  stamp: Stamp,
  vars: TemplateVars,
  action: Extract<
    AutomationAction,
    {
      type:
        | 'set_tags'
        | 'set_account'
        | 'set_method'
        | 'set_name'
        | 'set_notes'
        | 'set_url';
    }
  >,
): Promise<void> {
  switch (action.type) {
    case 'set_method':
      stamp.methodId = action.methodId;
      await updateBankTransactionEnrichment(userId, txnId, {
        methodId: action.methodId,
      });
      return;
    case 'set_name': {
      const resolved = applyTemplate(action.value, vars);
      stamp.name = resolved;
      await updateBankTransactionEnrichment(userId, txnId, {
        nameOverride: resolved,
      });
      return;
    }
    case 'set_notes': {
      const resolved = applyTemplate(action.value, vars);
      stamp.notes = resolved;
      await updateBankTransactionEnrichment(userId, txnId, {
        notesOverride: resolved,
      });
      return;
    }
    case 'set_account':
      stamp.accountId = action.accountId;
      await updateBankTransactionEnrichment(userId, txnId, {
        accountId: action.accountId,
      });
      return;
    case 'set_tags':
      stamp.tags = uniq([...stamp.tags, ...action.tags]);
      await updateBankTransactionEnrichment(userId, txnId, { tags: stamp.tags });
      return;
    case 'set_url': {
      stamp.url = action.value;
      let branding: { logoUrl?: string; color?: string } = {};
      try {
        branding = await fetchBranding(action.value);
      } catch {
        // network / SSRF guard — keep the URL, skip the image
      }
      if (branding.logoUrl) stamp.logoUrl = branding.logoUrl;
      if (branding.color) stamp.brandColor = branding.color;
      await updateBankTransactionEnrichment(userId, txnId, {
        url: stamp.url,
        logoUrl: stamp.logoUrl,
        brandColor: stamp.brandColor,
      });
      return;
    }
  }
}

async function applyReviewTerminal(
  userId: string,
  txn: BankTransaction,
  action: Extract<
    AutomationAction,
    { type: 'ignore' | 'log_expense' | 'create_payment' }
  >,
  stamp: Stamp,
  vars: TemplateVars,
): Promise<void> {
  if (action.type === 'ignore') {
    await markBankTransactionIgnored(userId, txn.id);
    return;
  }

  const date = txn.occurredAt.toISOString().slice(0, 10);
  const amountMinor = Math.abs(txn.amountMinor);
  // The action's own title / description (templated) win, then any enrich
  // stamp, then the merchant name / raw description.
  const actionName = action.name ? applyTemplate(action.name, vars) : '';
  const actionNotes = action.notes ? applyTemplate(action.notes, vars) : '';
  const name =
    actionName ||
    stamp.name ||
    cleanMerchant(txn.description, txn.rawType) ||
    txn.description;
  const notes = actionNotes || stamp.notes || txn.description;
  const accountId = action.accountId ?? stamp.accountId ?? null;
  const tagNames = uniq([...(action.tags ?? []), ...stamp.tags]);
  const tagIds =
    tagNames.length > 0
      ? (await getOrCreateTags(userId, tagNames)).map((t) => t.id)
      : [];

  // Resolve the provider website + its branding: the action's own `url`
  // (log_expense sub-form) wins, else whatever the enrich actions stamped.
  const actionUrl =
    action.type === 'log_expense' ? action.url ?? null : null;
  let url = actionUrl ?? stamp.url;
  let logoUrl = stamp.logoUrl;
  let brandColor = stamp.brandColor;
  if (url && !logoUrl) {
    try {
      const b = await fetchBranding(url);
      if (b.logoUrl) logoUrl = b.logoUrl;
      if (b.color) brandColor = b.color;
    } catch {
      // keep the URL, skip the image
    }
  }
  if (!url) url = null;

  if (action.type === 'log_expense') {
    // The stored budget id is one month's instance of a recurring series —
    // swap in the instance that actually covers this expense's date.
    const budgetId = action.budgetId
      ? await resolveBudgetForDate(userId, action.budgetId, date)
      : null;
    const expense = await createExpense(userId, {
      budgetId,
      accountId,
      bankId: action.bankId ?? txn.bankId ?? null,
      name,
      date,
      amountMinor,
      currency: txn.currency,
      notes,
      url,
      logoUrl,
      brandColor,
      tagIds,
    });
    if (expense) {
      await markBankTransactionCategorized(userId, txn.id, 'expense', expense.id);
    }
    return;
  }

  // create_payment — a one-time planned payment mirroring the transaction.
  const payment = await createPayment(userId, {
    name,
    amountKind: 'fixed',
    amountMinor,
    unitName: null,
    defaultUnits: 1,
    lineItems: null,
    feeKind: 'none',
    feeFixedMinor: 0,
    feePercent: 0,
    currency: txn.currency,
    methodId: stamp.methodId ?? null,
    accountId,
    bankId: txn.bankId ?? null,
    recipientMethodId: null,
    recurrence: 'one_time',
    anchorDate: date,
    dayOfMonth: null,
    endsOn: null,
    url,
    logoUrl,
    brandColor,
    isSubscription: false,
    budgetId: null,
    notes,
    tagIds,
  });
  await markBankTransactionCategorized(userId, txn.id, 'payment', payment.id);
  // The transaction already happened — tick off the occurrence it maps to.
  await markOccurrence(userId, {
    paymentId: payment.id,
    dueDate: date,
    status: 'paid',
  }).catch(() => undefined);
}

const ENRICH_TYPES = new Set([
  'set_tags',
  'set_account',
  'set_method',
  'set_name',
  'set_notes',
  'set_url',
]);

/**
 * Run every matching review automation against one pending transaction:
 * enrich actions stamp it, then at most one terminal action consumes it.
 * Records a hit (for run-count + notify) per automation that matched.
 * Returns `true` once a terminal action fired.
 */
type TerminalKind = 'ignore' | 'log_expense' | 'create_payment';

async function processReviewTxn(
  userId: string,
  txn: BankTransaction,
  automations: Automation[],
  bankNames: Map<string, string>,
  record: (automationId: string, vars: TemplateVars) => void,
): Promise<TerminalKind | null> {
  const subject = reviewSubject(txn, bankNames);
  const vars = reviewTemplateVars(txn, bankNames);
  const stamp = initStamp(txn);
  let terminal: TerminalKind | null = null;

  for (const auto of automations) {
    if (!evaluateConditions(auto.conditions, subject)) continue;

    let consumed = false;
    for (const action of auto.actions) {
      if (action.type === 'notify') continue; // handled after the sweep
      if (ENRICH_TYPES.has(action.type)) {
        await applyReviewEnrich(
          userId,
          txn.id,
          stamp,
          vars,
          action as Extract<
            AutomationAction,
            {
              type:
                | 'set_tags'
                | 'set_account'
                | 'set_method'
                | 'set_name'
                | 'set_notes'
                | 'set_url';
            }
          >,
        );
      } else if (isTerminalAction(action.type) && !consumed) {
        await applyReviewTerminal(
          userId,
          txn,
          action as Extract<AutomationAction, { type: TerminalKind }>,
          stamp,
          vars,
        );
        consumed = true;
        terminal = action.type as TerminalKind;
      }
    }
    // The title token reflects any `set_name` that just ran.
    record(auto.id, stamp.name ? { ...vars, title: stamp.name } : vars);
    if (consumed) return terminal; // this row is spoken for
  }
  return terminal;
}

// --- Entry points ------------------------------------------------------

/** What running the review automations over a batch of new rows did. */
export interface ReviewAutomationOutcome {
  /** New rows still `pending` when the engine started (i.e. post ignore-rules). */
  candidates: number;
  paymentsCreated: number;
  expensesCreated: number;
  /** Rows an `ignore` automation dropped. */
  autoIgnored: number;
}

const EMPTY_OUTCOME: ReviewAutomationOutcome = {
  candidates: 0,
  paymentsCreated: 0,
  expensesCreated: 0,
  autoIgnored: 0,
};

/**
 * Run the user's "expense for review created" automations over a set of
 * freshly-imported `bank_transactions` (by id). Rows already consumed (not
 * `pending`) are skipped. One terminal action per row; `notify` hits are
 * coalesced into a single notification/email per automation. Returns a tally
 * the caller turns into the "sync finished" summary.
 */
export async function runReviewExpenseAutomations(
  userId: string,
  transactionIds: string[],
): Promise<ReviewAutomationOutcome> {
  if (transactionIds.length === 0) return { ...EMPTY_OUTCOME };

  const txns = (await getBankTransactionsByIds(userId, transactionIds)).filter(
    (t) => t.status === 'pending',
  );
  const outcome: ReviewAutomationOutcome = {
    ...EMPTY_OUTCOME,
    candidates: txns.length,
  };
  if (txns.length === 0) return outcome;

  const automations = await listEnabledAutomations(
    userId,
    'review_expense_created',
  );
  if (automations.length === 0) return outcome;

  const bankNames = new Map(
    (await listBanks(userId)).map((b) => [b.id, b.name] as const),
  );

  /** automationId -> the template vars of each transaction it matched */
  const matched = new Map<string, TemplateVars[]>();
  const record = (id: string, vars: TemplateVars) => {
    const list = matched.get(id) ?? [];
    list.push(vars);
    matched.set(id, list);
  };

  for (const txn of txns) {
    const terminal = await processReviewTxn(
      userId,
      txn,
      automations,
      bankNames,
      record,
    );
    if (terminal === 'create_payment') outcome.paymentsCreated += 1;
    else if (terminal === 'log_expense') outcome.expensesCreated += 1;
    else if (terminal === 'ignore') outcome.autoIgnored += 1;
  }

  const ctx = await loadNotifyContext(userId);
  for (const auto of automations) {
    const hits = matched.get(auto.id);
    if (!hits || hits.length === 0) continue;
    await touchAutomationRun(auto.id, hits.length);
    const notify = notifyAction(auto);
    if (!notify) continue;
    await deliver(
      userId,
      ctx,
      notify.channel ?? 'both',
      reviewNotices(auto, notify, hits),
    );
  }
  return outcome;
}

/**
 * The concise "one new transaction" notice: `£12.40 paid at Pret`, plus a deep
 * link — to the plan card when an automation auto-filed it, to the review
 * inbox when it's still waiting. `null` if the row vanished.
 */
async function singleTxnNotice(
  userId: string,
  txnId: string,
): Promise<NotificationInput | null> {
  const [t] = await getBankTransactionsByIds(userId, [txnId]).catch(() => []);
  if (!t) return null;

  const merchant = t.nameOverride?.trim() || cleanMerchant(t.description);
  const outgoing = t.amountMinor < 0;
  const amount = formatMoney(money(Math.abs(t.amountMinor), t.currency));
  const at = `${amount} ${outgoing ? 'paid at' : 'received from'} ${merchant}`;
  const on = t.occurredAt.toISOString().slice(0, 10);

  if (t.status === 'categorized' && t.resultId) {
    const isPayment = t.resultType === 'payment';
    return {
      title: isPayment ? 'Planned payment created' : 'Expense logged',
      body: at,
      href: `/plan?focus=${t.resultId}&on=${on}`,
    };
  }
  return {
    title: 'New transaction to review',
    body: `${at} — needs a quick review`,
    href: REVIEW_HREF,
  };
}

/**
 * Leave the "bank sync finished" notification once a connection's sync has
 * imported new rows and the review automations above have run. In-app + push;
 * gated on the user's `notify_sync_summary` preference. Never throws.
 */
export async function notifySyncComplete(
  userId: string,
  input: {
    bankName: string | null;
    pulled: number;
    outcome: ReviewAutomationOutcome;
    /** Set when the sync brought in exactly one row — powers the concise
     * "£X paid at <merchant>" notification + a deep link to that item. */
    singleTxnId?: string;
  },
): Promise<void> {
  const { pulled, outcome } = input;
  if (pulled <= 0) return;

  const autoIgnoredAtImport = Math.max(0, pulled - outcome.candidates);
  const needsReview = Math.max(
    0,
    outcome.candidates - outcome.paymentsCreated - outcome.expensesCreated -
      outcome.autoIgnored,
  );
  // Nothing landed in the inbox and nothing was auto-created — just spam
  // filtered out. Not worth interrupting for.
  if (
    needsReview === 0 &&
    outcome.paymentsCreated === 0 &&
    outcome.expensesCreated === 0
  ) {
    return;
  }

  // One transaction, one message: skip the tally, say what it was, and link
  // straight to it.
  if (input.singleTxnId && outcome.candidates === 1) {
    try {
      const user = await findUserById(userId).catch(() => null);
      if (user && user.notifySyncSummary === false) return;
      const notice = await singleTxnNotice(userId, input.singleTxnId);
      if (notice) {
        await createNotifications(userId, [notice]);
        await sendPushToUser(userId, [notice]);
        return;
      }
    } catch (err) {
      console.error('[automations] single-txn notification failed', err);
    }
  }

  const summary: SyncSummary = {
    pulled,
    paymentsCreated: outcome.paymentsCreated,
    expensesCreated: outcome.expensesCreated,
    autoIgnored: autoIgnoredAtImport + outcome.autoIgnored,
    needsReview,
  };

  try {
    const user = await findUserById(userId).catch(() => null);
    if (user && user.notifySyncSummary === false) return;
    const notice: NotificationInput = {
      title: input.bankName ? `${input.bankName} sync complete` : 'Bank sync complete',
      body: formatSyncSummary(summary),
      href: REVIEW_HREF,
    };
    await createNotifications(userId, [notice]);
    await sendPushToUser(userId, [notice]);
  } catch (err) {
    console.error('[automations] sync-summary notification failed', err);
  }
}

/**
 * A custom title/message → one templated notice per matched transaction.
 * Otherwise a single coalesced summary.
 */
function reviewNotices(
  auto: Automation,
  notify: Extract<AutomationAction, { type: 'notify' }>,
  hits: TemplateVars[],
): NotificationInput[] {
  if (notify.title || notify.message) {
    return hits.map((vars) => ({
      title: notify.title ? applyTemplate(notify.title, vars) : auto.name,
      body: notify.message ? applyTemplate(notify.message, vars) : '',
      href: REVIEW_HREF,
      automationId: auto.id,
    }));
  }
  const n = hits.length;
  const sample = hits
    .slice(0, 3)
    .map((v) => v.title)
    .join(', ');
  return [
    {
      title: auto.name,
      body:
        n === 1
          ? `Matched a transaction for review: ${sample}.`
          : `Matched ${n} transactions for review: ${sample}${
              n > 3 ? '…' : ''
            }.`,
      href: REVIEW_HREF,
      automationId: auto.id,
    },
  ];
}

/**
 * Run the user's "payment or expense added" automations against one record the
 * user just created. Never called for engine-created records, so rules can't
 * chain.
 */
export async function runRecordAutomations(
  userId: string,
  input: RecordSubjectInput,
): Promise<void> {
  const automations = await listEnabledAutomations(userId, 'record_created');
  if (automations.length === 0) return;

  const refs = (field: string) =>
    automations.some((a) => a.conditions.some((c) => c.field === field));
  const subject = await recordSubject(
    userId,
    input,
    refs('account'),
    refs('method'),
  );
  const vars: TemplateVars = {
    name: input.name,
    title: input.name,
    amount: formatMoney(
      money(Math.abs(input.amountMinor), input.currency),
    ),
    currency: input.currency,
    kind: input.kind,
    account: String(subject['account'] ?? ''),
    method: String(subject['method'] ?? ''),
    recurrence: input.recurrence ?? '',
    date: new Date().toISOString().slice(0, 10),
  };
  const ctx = await loadNotifyContext(userId);

  for (const auto of automations) {
    if (!evaluateConditions(auto.conditions, subject)) continue;

    for (const action of auto.actions) {
      if (action.type === 'add_tags') {
        const ids = (await getOrCreateTags(userId, action.tags)).map(
          (t) => t.id,
        );
        if (input.kind === 'payment') {
          await addPaymentTags(userId, input.recordId, ids);
        } else {
          await addExpenseTags(userId, input.recordId, ids);
        }
      } else if (action.type === 'set_account') {
        if (input.kind === 'payment') {
          await setPaymentAccount(userId, input.recordId, action.accountId);
        } else {
          await setExpenseAccount(userId, input.recordId, action.accountId);
        }
      } else if (action.type === 'set_method') {
        // Methods are a payment concept — a no-op for expenses.
        if (input.kind === 'payment') {
          await setPaymentMethod(userId, input.recordId, action.methodId);
        }
      } else if (action.type === 'notify') {
        await deliver(userId, ctx, action.channel ?? 'both', [
          {
            title: action.title
              ? applyTemplate(action.title, vars)
              : auto.name,
            body: action.message
              ? applyTemplate(action.message, vars)
              : `${input.kind === 'payment' ? 'Payment' : 'Expense'} “${
                  input.name
                }” matched.`,
            href: RECORD_HREF,
            automationId: auto.id,
          },
        ]);
      }
    }
    await touchAutomationRun(auto.id, 1);
  }
}

/**
 * Re-run one automation against everything already in the system — the pending
 * review inbox for a review rule. Returns how many items it acted on. Used by
 * the "apply to existing" prompt after a rule is saved.
 */
export async function runAutomationNow(
  userId: string,
  automation: Automation,
): Promise<number> {
  if (!automation.enabled) return 0;
  if (automation.trigger !== 'review_expense_created') return 0;

  const pending = await listPendingBankTransactions(userId);
  if (pending.length === 0) return 0;
  const bankNames = new Map(
    (await listBanks(userId)).map((b) => [b.id, b.name] as const),
  );

  const seen = new Map<string, TemplateVars[]>();
  const record = (id: string, vars: TemplateVars) => {
    const list = seen.get(id) ?? [];
    list.push(vars);
    seen.set(id, list);
  };
  for (const txn of pending) {
    await processReviewTxn(userId, txn, [automation], bankNames, record);
  }
  const hits = seen.get(automation.id) ?? [];

  if (hits.length === 0) return 0;
  await touchAutomationRun(automation.id, hits.length);
  const notify = notifyAction(automation);
  if (notify) {
    await deliver(
      userId,
      await loadNotifyContext(userId),
      notify.channel ?? 'both',
      reviewNotices(automation, notify, hits),
    );
  }
  return hits.length;
}

/** Count (without acting) how many pending review items a rule would match. */
export async function countMatchingPending(
  userId: string,
  automation: Pick<Automation, 'trigger' | 'conditions'>,
): Promise<number> {
  if (automation.trigger !== 'review_expense_created') return 0;
  const pending = await listPendingBankTransactions(userId);
  if (pending.length === 0) return 0;
  const bankNames = new Map(
    (await listBanks(userId)).map((b) => [b.id, b.name] as const),
  );
  return pending.filter((txn) =>
    evaluateConditions(automation.conditions, reviewSubject(txn, bankNames)),
  ).length;
}
