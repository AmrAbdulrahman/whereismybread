import { requireUserId } from '@wib/auth/server';
import {
  listProvidersWithUsage,
  tagsByIds,
  type ProviderWithUsage,
} from '@wib/db';
import type { LabelItem } from '@wib/ui';
import type { ProviderMark } from './actions';

/** Every provider the signed-in user owns, with usage counts + default tag ids. */
export async function getProviders(): Promise<ProviderWithUsage[]> {
  const userId = await requireUserId();
  return listProvidersWithUsage(userId);
}

/** The `<LabelManager>` row shape for the /providers page (default tags resolved to names). */
export async function getProviderRows(): Promise<LabelItem<ProviderMark>[]> {
  const userId = await requireUserId();
  const rows = await listProvidersWithUsage(userId);
  const tags = await tagsByIds(
    userId,
    [...new Set(rows.flatMap((r) => r.defaultTagIds))],
  );
  const nameById = new Map(tags.map((t) => [t.id, t.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color ?? '#6321d6',
    usageCount: r.paymentCount + r.expenseCount,
    mark: {
      url: r.url,
      logoUrl: r.logoUrl,
      defaultTags: r.defaultTagIds
        .map((tid) => nameById.get(tid))
        .filter((n): n is string => n != null),
    },
  }));
}
