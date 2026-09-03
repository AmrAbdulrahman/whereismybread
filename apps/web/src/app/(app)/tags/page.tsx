import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { LabelManager } from '@wib/ui';
import {
  deleteTagAction,
  listTagsAction,
  saveTagAction,
} from '@wib/feature-tags';
import { getTags } from '@wib/feature-tags/server';

export const metadata = { title: 'Tags' };
export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const tags = await getTags();
  return (
    <LabelManager
      title="Tags"
      noun="tag"
      usageNoun="payment"
      deleteImpact="cascade"
      description="Labels you attach to payments. Renaming or recolouring one updates it everywhere it's used."
      namePlaceholder="Essentials, Egypt trip, Work…"
      items={tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        usageCount: t.paymentCount,
      }))}
      onSave={saveTagAction}
      onDelete={deleteTagAction}
      onRefresh={listTagsAction}
    />
  );
}
