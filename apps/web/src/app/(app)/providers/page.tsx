import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { ProviderManager } from '@wib/feature-providers';
import { getProviderRows } from '@wib/feature-providers/server';
import { getTags } from '@wib/feature-tags/server';

export const metadata = { title: 'Providers' };
export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [items, tags] = [await getProviderRows(), await getTags()];

  return (
    <ProviderManager
      items={items}
      tags={tags.map((t) => ({ name: t.name, color: t.color }))}
    />
  );
}
