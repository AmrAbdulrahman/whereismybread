'use server';

import { updateTag } from 'next/cache';
import { requireUserId } from '@wib/auth/server';
import { setInsightsLayout, type InsightsLayoutData } from '@wib/db';

/** True for a `Record<string, string[]>`. */
function isOrder(v: unknown): v is Record<string, string[]> {
  return (
    !!v &&
    typeof v === 'object' &&
    Object.values(v as Record<string, unknown>).every(
      (a) => Array.isArray(a) && a.every((x) => typeof x === 'string'),
    )
  );
}
/** True for a `Record<string, number>`. */
function isSpans(v: unknown): v is Record<string, number> {
  return (
    !!v &&
    typeof v === 'object' &&
    Object.values(v as Record<string, unknown>).every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    )
  );
}

/** Persist the Insights page card order + sizes. */
export async function saveInsightsLayoutAction(
  layout: InsightsLayoutData,
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  if (!layout || !isOrder(layout.order) || !isSpans(layout.spans)) {
    return { ok: false };
  }
  // Bound the payload — 40 cards / spans is already far more than exist.
  const order: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(layout.order)) {
    order[k] = ids.slice(0, 40).map((s) => s.slice(0, 64));
  }
  const spans: Record<string, number> = {};
  for (const [k, n] of Object.entries(layout.spans).slice(0, 40)) {
    spans[k.slice(0, 64)] = Math.min(6, Math.max(1, Math.round(n)));
  }
  await setInsightsLayout(userId, { order, spans });
  updateTag(`user-data:${userId}`);
  return { ok: true };
}
