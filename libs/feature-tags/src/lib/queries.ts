import { requireUserId } from '@wib/auth/server';
import { listTagsWithUsage, type TagWithUsage } from '@wib/db';

/** Every tag the signed-in user owns, with how many payments use each. */
export async function getTags(): Promise<TagWithUsage[]> {
  const userId = await requireUserId();
  return listTagsWithUsage(userId);
}
