'use server';

import { requireUserId } from '@wib/auth/server';
import { fieldErrors, type FormState } from '@wib/auth';
import {
  createAutomation,
  deleteAutomation,
  deletePushSubscription,
  getAutomation,
  listNotificationsPage,
  markNotificationsRead,
  reorderAutomations,
  savePushSubscription,
  setAutomationEnabled,
  updateAutomation,
  updateUserNotificationPrefs,
  type Automation,
  type AutomationInput,
  type Notification,
  type NotificationCursor,
} from '@wib/db';
import { RECORD_SOURCE_FIELD } from '@wib/domain';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  automationFormSchema,
  toStoredAction,
  toStoredCondition,
  type AutomationFormValues,
} from './schema';
import { countMatchingPending, runAutomationNow } from './engine';
import { revalidateUserData } from './revalidate';

function bumpAll(userId: string): void {
  revalidatePath('/automations');
  revalidatePath('/notifications');
  revalidatePath('/plan');
  revalidatePath('/integrations');
  revalidateUserData(userId);
}

export interface SaveAutomationResult extends FormState {
  item?: Automation;
  /** How many existing pending review items this rule would match right now. */
  matchingExisting?: number;
}

export async function saveAutomationAction(
  id: string | null,
  values: AutomationFormValues,
): Promise<SaveAutomationResult> {
  const userId = await requireUserId();
  const parsed = automationFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const v = parsed.data;
  const conditions = v.conditions.map(toStoredCondition);
  // `record_created` rules can be scoped to how the record was added. Stored
  // as a normal condition so `evaluateConditions` filters on it for free;
  // `any` stores nothing (fires for either source).
  if (v.trigger === 'record_created' && v.recordSource !== 'any') {
    conditions.push({
      field: RECORD_SOURCE_FIELD,
      operator: 'is',
      value: v.recordSource,
    });
  }
  const input: AutomationInput = {
    name: v.name,
    trigger: v.trigger,
    conditions,
    actions: v.actions.map(toStoredAction),
  };

  const item = id
    ? await updateAutomation(userId, id, input)
    : await createAutomation(userId, input);
  if (!item) return { ok: false, error: 'That automation no longer exists.' };

  bumpAll(userId);
  const matchingExisting = await countMatchingPending(userId, item);
  return { ok: true, item, matchingExisting };
}

export async function deleteAutomationAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  await deleteAutomation(userId, id);
  bumpAll(userId);
  return { ok: true };
}

export async function toggleAutomationAction(
  id: string,
  enabled: boolean,
): Promise<FormState> {
  const userId = await requireUserId();
  await setAutomationEnabled(userId, id, enabled);
  bumpAll(userId);
  return { ok: true };
}

export async function reorderAutomationsAction(
  ids: string[],
): Promise<FormState> {
  const userId = await requireUserId();
  await reorderAutomations(
    userId,
    (Array.isArray(ids) ? ids : []).filter((s) => typeof s === 'string'),
  );
  revalidatePath('/automations');
  return { ok: true };
}

export async function runAutomationNowAction(
  id: string,
): Promise<FormState & { applied?: number }> {
  const userId = await requireUserId();
  const automation = await getAutomation(userId, id);
  if (!automation) return { ok: false, error: 'That automation no longer exists.' };
  const applied = await runAutomationNow(userId, automation);
  bumpAll(userId);
  return {
    ok: true,
    applied,
    message:
      applied === 0
        ? 'No existing items matched.'
        : `Applied to ${applied} existing item${applied === 1 ? '' : 's'}.`,
  };
}

export async function markNotificationsReadAction(
  ids?: string[],
): Promise<FormState> {
  const userId = await requireUserId();
  await markNotificationsRead(
    userId,
    Array.isArray(ids) ? ids.filter((s) => typeof s === 'string') : undefined,
  );
  revalidatePath('/notifications');
  revalidatePath('/automations');
  return { ok: true };
}

export interface NotificationsPageResult {
  items: Notification[];
  nextCursor: NotificationCursor | null;
}

/** One page of the current user's notifications for the bell's infinite list. */
export async function loadNotificationsAction(
  cursor?: NotificationCursor | null,
): Promise<NotificationsPageResult> {
  const userId = await requireUserId();
  const safe =
    cursor &&
    typeof cursor.createdAt === 'string' &&
    typeof cursor.id === 'string'
      ? { createdAt: cursor.createdAt, id: cursor.id }
      : null;
  return listNotificationsPage(userId, { limit: 20, cursor: safe });
}

// --- Notification preferences + Web Push ----------------------------------

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(500).optional(),
});

/** Register this browser for Web Push (called after the user grants permission). */
export async function savePushSubscriptionAction(
  input: unknown,
): Promise<FormState> {
  const userId = await requireUserId();
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid push subscription.' };
  await savePushSubscription(userId, parsed.data);
  revalidatePath('/settings');
  return { ok: true };
}

/** Forget this browser's subscription (user turned push off, or it expired). */
export async function deletePushSubscriptionAction(
  endpoint: unknown,
): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof endpoint === 'string' && endpoint.length > 0) {
    await deletePushSubscription(endpoint, userId);
  }
  revalidatePath('/settings');
  return { ok: true };
}

const notificationPrefsSchema = z.object({
  notifyEmail: z.boolean(),
  notifySyncSummary: z.boolean(),
});

export async function updateNotificationPrefsAction(
  input: unknown,
): Promise<FormState> {
  const userId = await requireUserId();
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  await updateUserNotificationPrefs(userId, parsed.data);
  revalidatePath('/settings');
  return { ok: true, message: 'Notification settings saved.' };
}
