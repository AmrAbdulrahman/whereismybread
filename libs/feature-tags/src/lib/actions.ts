'use server';

import { fieldErrors, type FormState } from '@wib/auth';
import { requireUserId } from '@wib/auth/server';
import {
  createTag,
  deleteTag,
  getTagByName,
  listTagsWithUsage,
  updateTag,
  type Tag,
  type TagWithUsage,
} from '@wib/db';
import { revalidatePath } from 'next/cache';
import { tagFormSchema, type TagFormValues } from './schema';

/** Payments show tags, so a rename / recolour / delete needs the plan re-rendered. */
function revalidate() {
  revalidatePath('/tags');
  revalidatePath('/plan');
}

export async function createTagAction(
  values: TagFormValues,
): Promise<FormState & { tag?: Tag }> {
  const userId = await requireUserId();

  const parsed = tagFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  if (await getTagByName(userId, parsed.data.name)) {
    return { ok: false, fieldErrors: { name: ['You already have a tag with that name'] } };
  }

  const tag = await createTag(userId, parsed.data.name, parsed.data.color);
  revalidate();
  return { ok: true, tag };
}

export async function updateTagAction(
  id: string,
  values: TagFormValues,
): Promise<FormState & { tag?: Tag }> {
  const userId = await requireUserId();
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That tag no longer exists.' };
  }

  const parsed = tagFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const tag = await updateTag(userId, id, parsed.data);
  if (!tag) {
    return {
      ok: false,
      fieldErrors: { name: ['You already have a tag with that name'] },
    };
  }
  revalidate();
  return { ok: true, tag };
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

/** The current tag list with usage counts — for an optimistic client refresh. */
export async function listTagsAction(): Promise<TagWithUsage[]> {
  const userId = await requireUserId();
  return listTagsWithUsage(userId);
}
