'use server';

import { fieldErrors, type FormState } from '@wib/auth';
import { requireUserId } from '@wib/auth/server';
import {
  createProvider,
  deleteProvider,
  fetchBranding,
  getOrCreateTags,
  getProviderByName,
  listProvidersWithUsage,
  listTags,
  setProviderDefaultTags,
  tagsByIds,
  updateProvider,
  type Branding,
} from '@wib/db';
import type { LabelItem, LabelSaveResult } from '@wib/ui';
import { revalidatePath, updateTag as bustCacheTag } from 'next/cache';
import { providerFormSchema } from './schema';

/** The list-row mark carried alongside a provider's name + colour. */
export interface ProviderMark {
  url: string | null;
  logoUrl: string | null;
  /** Default tag names that auto-populate when the provider is picked. */
  defaultTags: string[];
}

/** A provider as the `<LabelManager>` / form pickers consume it. */
export type ProviderRow = LabelItem<ProviderMark>;

/** Payments / expenses show provider branding, so a change needs the plan re-rendered.
 * `user-data:<id>` busts the shared page-bundle data cache — kept as a literal
 * here because a feature lib can't import another feature lib. */
function revalidate(userId: string) {
  revalidatePath('/providers');
  revalidatePath('/plan');
  revalidatePath('/insights');
  revalidatePath('/budgets');
  bustCacheTag(`user-data:${userId}`);
}

async function buildRows(userId: string): Promise<ProviderRow[]> {
  const rows = await listProvidersWithUsage(userId);
  const allTagIds = [...new Set(rows.flatMap((r) => r.defaultTagIds))];
  const tags = await tagsByIds(userId, allTagIds);
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

/**
 * Create / update a provider. Matches `<LabelManager>`'s `onSave` shape —
 * `mark` carries the website, uploaded logo, and default tag names.
 */
export async function saveProviderAction(
  id: string | null,
  values: { name: string; color: string; mark?: ProviderMark },
): Promise<LabelSaveResult<ProviderMark>> {
  const userId = await requireUserId();

  const parsed = providerFormSchema.safeParse({
    name: values.name,
    color: values.color,
    url: values.mark?.url ?? null,
    logoUrl: values.mark?.logoUrl ?? null,
    defaultTags: values.mark?.defaultTags ?? [],
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { name, url, logoUrl, color, defaultTags } = parsed.data;

  const tags = await getOrCreateTags(userId, defaultTags);
  const tagIds = tags.map((t) => t.id);

  if (!id) {
    if (await getProviderByName(userId, name)) {
      return {
        ok: false,
        fieldErrors: { name: ['You already have a provider with that name'] },
      };
    }
    const provider = await createProvider(userId, { name, url, logoUrl, color });
    await setProviderDefaultTags(userId, provider.id, tagIds);
    revalidate(userId);
    return { ok: true, item: await rowFor(userId, provider.id) };
  }

  const provider = await updateProvider(userId, id, { name, url, logoUrl, color });
  if (!provider) {
    return {
      ok: false,
      fieldErrors: { name: ['You already have a provider with that name'] },
    };
  }
  await setProviderDefaultTags(userId, provider.id, tagIds);
  revalidate(userId);
  return { ok: true, item: await rowFor(userId, provider.id) };
}

async function rowFor(userId: string, id: string): Promise<ProviderRow> {
  const rows = await buildRows(userId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error('saveProviderAction: row vanished');
  return row;
}

export async function deleteProviderAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That provider no longer exists.' };
  }
  await deleteProvider(userId, id);
  revalidate(userId);
  return { ok: true };
}

/** The current provider list — for the manager's optimistic refresh + the pickers. */
export async function listProvidersAction(): Promise<ProviderRow[]> {
  const userId = await requireUserId();
  return buildRows(userId);
}

/** Provider list + the user's tag palette — one call for `<ProviderPicker>`. */
export async function providerPickerDataAction(): Promise<{
  providers: ProviderRow[];
  tags: Array<{ name: string; color: string }>;
}> {
  const userId = await requireUserId();
  const [providers, tags] = [await buildRows(userId), await listTags(userId)];
  return {
    providers,
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
  };
}

export async function fetchProviderBrandingAction(
  url: string,
): Promise<{ ok: true; branding: Branding } | { ok: false; error: string }> {
  await requireUserId();
  if (typeof url !== 'string' || url.trim().length < 3 || url.length > 2048) {
    return { ok: false, error: 'Enter a website first.' };
  }
  try {
    const branding = await fetchBranding(url);
    if (!branding.logoUrl && !branding.color && !branding.name) {
      return { ok: false, error: 'Couldn’t find any branding on that site.' };
    }
    return { ok: true, branding };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Couldn’t reach that site.',
    };
  }
}
