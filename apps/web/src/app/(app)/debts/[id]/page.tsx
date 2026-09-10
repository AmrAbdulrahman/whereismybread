import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { DebtDetail } from '@wib/feature-debts';
import { getDebt, getDebtsData } from '@wib/feature-debts/server';

export const metadata = { title: 'Debt' };
export const dynamic = 'force-dynamic';

export default async function DebtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const [debt, data] = await Promise.all([getDebt(id), getDebtsData()]);
  if (!debt) notFound();

  return (
    <DebtDetail
      debt={debt}
      people={data.people}
      today={data.today}
      usedCurrencies={data.usedCurrencies}
      defaultCurrency={data.defaultCurrency}
      shareUrl={`${data.appUrl}/d/${debt.person.shareId}`}
    />
  );
}
