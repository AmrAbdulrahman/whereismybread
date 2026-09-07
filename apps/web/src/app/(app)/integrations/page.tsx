import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { todayIn } from '@wib/domain';
import { IntegrationsView } from '@wib/feature-payments';
import {
  getBanks,
  getBankConnectionsData,
  getBankTransactionsData,
  getBoardData,
  getBudgetsData,
  getConnectableBanks,
} from '@wib/feature-payments/server';

export const metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { bank } = await searchParams;
  const { context, board } = await getBoardData();
  const budgets = await getBudgetsData();
  const banks = await getBanks();
  const { pending } = await getBankTransactionsData();
  const connections = await getBankConnectionsData();
  const connectable = await getConnectableBanks();

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-ink-soft">
          Connect a bank for automatic updates or upload a statement. New
          transactions come in for you to log as an expense, turn into a
          planned payment, or ignore.
        </p>
      </header>

      <IntegrationsView
        banks={banks}
        connections={connections}
        connectable={connectable}
        bankParam={bank}
        pending={pending}
        context={context}
        budgets={budgets}
        today={todayIn(user.timezone)}
        defaultCurrency={user.defaultCurrency}
        rates={board.rates}
      />
    </div>
  );
}
