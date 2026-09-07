import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { BudgetsView } from '@wib/feature-payments';
import {
  getAccounts,
  getBanks,
  getBudgetsData,
  getTags,
} from '@wib/feature-payments/server';
import { todayIn } from '@wib/domain';

export const metadata = { title: 'Budgets' };
export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const budgets = await getBudgetsData();
  const accounts = await getAccounts();
  const banks = await getBanks();
  const tags = await getTags();
  const usedCurrencies = [
    ...new Set([...budgets.map((b) => b.limit.currency), user.defaultCurrency]),
  ];

  return (
    <BudgetsView
      budgets={budgets}
      accounts={accounts}
      banks={banks}
      tags={tags}
      today={todayIn(user.timezone)}
      defaultCurrency={user.defaultCurrency}
      usedCurrencies={usedCurrencies}
    />
  );
}
