import { and, asc, eq, inArray } from 'drizzle-orm';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
} from '@wib/domain';
import { getDb } from '../client';
import { automations, type Automation } from '../schema/automations';

export interface AutomationInput {
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled?: boolean;
}

/** Every automation the user has, in evaluation order. */
export async function listAutomations(userId: string): Promise<Automation[]> {
  return getDb()
    .select()
    .from(automations)
    .where(eq(automations.userId, userId))
    .orderBy(asc(automations.sortOrder), asc(automations.createdAt));
}

/** Enabled automations for one trigger, in evaluation order. */
export async function listEnabledAutomations(
  userId: string,
  trigger: AutomationTrigger,
): Promise<Automation[]> {
  return getDb()
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.userId, userId),
        eq(automations.trigger, trigger),
        eq(automations.enabled, true),
      ),
    )
    .orderBy(asc(automations.sortOrder), asc(automations.createdAt));
}

export async function getAutomation(
  userId: string,
  id: string,
): Promise<Automation | null> {
  const rows = await getDb()
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Append an automation to the end of the list. */
export async function createAutomation(
  userId: string,
  input: AutomationInput,
): Promise<Automation> {
  const existing = await getDb()
    .select({ sortOrder: automations.sortOrder })
    .from(automations)
    .where(eq(automations.userId, userId));
  const nextOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

  const rows = await getDb()
    .insert(automations)
    .values({
      userId,
      name: input.name.trim(),
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      enabled: input.enabled ?? true,
      sortOrder: nextOrder,
    })
    .returning();
  if (!rows[0]) throw new Error('createAutomation: no row');
  return rows[0];
}

export async function updateAutomation(
  userId: string,
  id: string,
  input: AutomationInput,
): Promise<Automation | null> {
  const rows = await getDb()
    .update(automations)
    .set({
      name: input.name.trim(),
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, id), eq(automations.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function setAutomationEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await getDb()
    .update(automations)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.userId, userId)));
}

export async function deleteAutomation(
  userId: string,
  id: string,
): Promise<void> {
  await getDb()
    .delete(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, userId)));
}

/** Persist a new order — `ids` is the full list in the desired sequence. */
export async function reorderAutomations(
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const owned = await getDb()
    .select({ id: automations.id })
    .from(automations)
    .where(
      and(eq(automations.userId, userId), inArray(automations.id, ids)),
    );
  const ownedIds = new Set(owned.map((r) => r.id));
  const db = getDb();
  let order = 0;
  for (const id of ids) {
    if (!ownedIds.has(id)) continue;
    await db
      .update(automations)
      .set({ sortOrder: order++, updatedAt: new Date() })
      .where(eq(automations.id, id));
  }
}

/** Stamp a run — bumps `runCount` and `lastRunAt`. */
export async function touchAutomationRun(
  id: string,
  matched: number,
): Promise<void> {
  if (matched <= 0) return;
  const rows = await getDb()
    .select({ runCount: automations.runCount })
    .from(automations)
    .where(eq(automations.id, id))
    .limit(1);
  const current = rows[0]?.runCount ?? 0;
  await getDb()
    .update(automations)
    .set({ runCount: current + matched, lastRunAt: new Date() })
    .where(eq(automations.id, id));
}
