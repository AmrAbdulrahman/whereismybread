import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { TagsManager } from '@wib/feature-tags';
import { getTags } from '@wib/feature-tags/server';

export const metadata = { title: 'Tags' };
export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const tags = await getTags();
  return <TagsManager tags={tags} />;
}
