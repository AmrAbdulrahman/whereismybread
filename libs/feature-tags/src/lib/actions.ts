'use server';

import { fieldErrors, type FormState } from '@wib/auth';
import { requireUserId } from '@wib/auth/server';
import {
  createTag,
  deleteTag,
  getTagByName,
  listTagsWithUsage,
  updateTag,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import { tagFormSchema } from './schema';

/** `{id,name,color,usageCount}` — the shape `@wib/ui`'s LabelManager consumes. */
export interface TagRow {
  id: string;
  name: string;
  color: string;
  usageCount: number;
}

/** Payments show tags, so a rename / recolour / delete needs the plan re-rendered. */
function revalidate() {
  revalidatePath('/tags');
  revalidatePath('/plan');
}

export async function saveTagAction(
  id: string | null,
  values: { name: string; color: string },
): Promise<FormState & { item?: TagRow }> {
  const userId = await requireUserId();

  const parsed = tagFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  if (!id) {
    if (await getTagByName(userId, parsed.data.name)) {
      return {
        ok: false,
        fieldErrors: { name: ['You already have a tag with that name'] },
      };
    }
    const tag = await createTag(userId, parsed.data.name, parsed.data.color);
    revalidate();
    return {
      ok: true,
      item: { id: tag.id, name: tag.name, color: tag.color, usageCount: 0 },
    };
  }

  const tag = await updateTag(userId, id, parsed.data);
  if (!tag) {
    return {
      ok: false,
      fieldErrors: { name: ['You already have a tag with that name'] },
    };
  }
  revalidate();
  return {
    ok: true,
    item: { id: tag.id, name: tag.name, color: tag.color, usageCount: 0 },
  };
}

export async function deleteTagAction(id: string): Promise<FormState> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That tag no longer exists.' };
  }
  await deleteTag(userId, id);
  revalidate();
  return { ok: true };
}

/** The current tag list with usage counts — for the manager's optimistic refresh. */
export async function listTagsAction(): Promise<TagRow[]> {
  const userId = await requireUserId();
  const rows = await listTagsWithUsage(userId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    usageCount: r.paymentCount,
  }));
}
