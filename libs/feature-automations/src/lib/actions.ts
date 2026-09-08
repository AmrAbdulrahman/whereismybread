'use server';

import { requireUserId } from '@wib/auth/server';
import { fieldErrors, type FormState } from '@wib/auth';
import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  markNotificationsRead,
  reorderAutomations,
  setAutomationEnabled,
  updateAutomation,
  type Automation,
  type AutomationInput,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
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
  const input: AutomationInput = {
    name: v.name,
    trigger: v.trigger,
    conditions: v.conditions.map(toStoredCondition),
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
