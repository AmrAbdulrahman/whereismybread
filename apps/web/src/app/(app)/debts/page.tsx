import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { DebtsView } from '@wib/feature-debts';
import { getDebtsData } from '@wib/feature-debts/server';

export const metadata = { title: 'Debts' };
export const dynamic = 'force-dynamic';

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const data = await getDebtsData();
  return <DebtsView data={data} />;
}
