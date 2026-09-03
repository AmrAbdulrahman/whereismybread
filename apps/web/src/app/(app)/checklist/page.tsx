import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { ChecklistView } from '@wib/feature-payments';
import { getChecklistData } from '@wib/feature-payments/server';

export const metadata = { title: 'Manual payments' };
export const dynamic = 'force-dynamic';

export default async function ChecklistPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const data = await getChecklistData();
  return <ChecklistView {...data} />;
}
