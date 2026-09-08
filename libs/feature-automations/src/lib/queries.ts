import 'server-only';

import {
  countUnreadNotifications,
  listAccounts,
  listAutomations,
  listBanks,
  listBudgets,
  listNotifications,
  listPaymentMethods,
  listTags,
  type Account,
  type Automation,
  type Bank,
  type Notification,
  type PaymentMethod,
  type Tag,
} from '@wib/db';

export interface AutomationLookups {
  accounts: Pick<Account, 'id' | 'name' | 'color'>[];
  banks: Pick<Bank, 'id' | 'name' | 'color'>[];
  methods: Pick<PaymentMethod, 'id' | 'name'>[];
  tags: Pick<Tag, 'id' | 'name' | 'color'>[];
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
  const budgets = await listBudgets(userId);
  return {
    automations,
    lookups: {
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, color: a.color })),
      banks: banks.map((b) => ({ id: b.id, name: b.name, color: b.color })),
      methods: methods.map((m) => ({ id: m.id, name: m.name })),
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      budgets: budgets
        .filter((b) => !b.closedAt)
        .map((b) => ({ id: b.id, name: b.name })),
    },
  };
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
