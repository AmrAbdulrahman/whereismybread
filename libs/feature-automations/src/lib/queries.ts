import 'server-only';

import {
  countUnreadNotifications,
  listAccounts,
  listAutomations,
  listBanks,
  listBudgets,
  listNotifications,
  listPaymentMethods,
  listProviders,
  listTags,
  type Account,
  type Automation,
  type Bank,
  type Budget,
  type Notification,
  type PaymentMethod,
  type Provider,
  type Tag,
} from '@wib/db';

export interface AutomationLookups {
  accounts: Pick<Account, 'id' | 'name' | 'color'>[];
  banks: Pick<Bank, 'id' | 'name' | 'color'>[];
  methods: Pick<PaymentMethod, 'id' | 'name'>[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
  providers: Pick<Provider, 'id' | 'name' | 'logoUrl' | 'color'>[];
  budgets: { id: string; name: string }[];
}

export interface AutomationsData {
  automations: Automation[];
  lookups: AutomationLookups;
}

/** The automations list + the lookup lists the editor needs. */
export async function getAutomationsData(
  userId: string,
): Promise<AutomationsData> {
  // Sequential — the Supabase transaction pooler hangs on pipelined queries.
  const automations = await listAutomations(userId);
  const accounts = await listAccounts(userId);
  const banks = await listBanks(userId);
  const methods = await listPaymentMethods(userId);
  const tags = await listTags(userId);
  const providers = await listProviders(userId);
  const budgets = await listBudgets(userId);
  return {
    automations,
    lookups: {
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, color: a.color })),
      banks: banks.map((b) => ({ id: b.id, name: b.name, color: b.color })),
      methods: methods.map((m) => ({ id: m.id, name: m.name })),
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        logoUrl: p.logoUrl,
        color: p.color,
      })),
      // Only recurring monthly budgets — a one-off budget is a single month's
      // envelope and the automation would keep filing into a stale, closed
      // month. Deduped to one entry per series, anchored on the *earliest*
      // instance id (stable as later months materialise); the engine resolves
      // the right month's instance at fire time.
      budgets: recurringBudgetSeries(budgets),
    },
  };
}

function recurringBudgetSeries(budgets: Budget[]): { id: string; name: string }[] {
  const byName = new Map<string, { id: string; name: string; startDate: string }>();
  for (const b of budgets) {
    if (!b.recurring || b.closedAt) continue;
    const key = b.name.toLowerCase();
    const cur = byName.get(key);
    if (!cur || b.startDate < cur.startDate) {
      byName.set(key, { id: b.id, name: b.name, startDate: b.startDate });
    }
  }
  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}

export interface NotificationsData {
  notifications: Notification[];
  unread: number;
}

export async function getNotificationsData(
  userId: string,
): Promise<NotificationsData> {
  const notifications = await listNotifications(userId, { limit: 100 });
  const unread = notifications.filter((n) => !n.readAt).length;
  return { notifications, unread };
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  return countUnreadNotifications(userId);
}
