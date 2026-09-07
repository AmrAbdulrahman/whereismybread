import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { Dashboard, InsightsView } from '@wib/feature-insights';
import {
  getDashboardData,
  getInsightsData,
} from '@wib/feature-insights/server';
import { getBoardData } from '@wib/feature-payments/server';

export const metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { m } = await searchParams;
  const data = await getInsightsData();
  const dashboard = await getDashboardData(m);
  // Served from the same cached page bundle `getInsightsData` already read —
  // no extra round trip. Powers the in-place payment edit modal.
  const { context, board } = await getBoardData();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-ink-soft">
          What&apos;s coming up and what needs a look. Drag cards to rearrange,
          or drag their right edge to resize.
        </p>
      </header>

      <InsightsView
        data={data}
        editable={board.editable}
        overrides={board.overrides}
        paymentCtx={{
          methods: context.methods,
          accounts: context.accounts,
          banks: context.banks,
          recipientMethods: context.recipientMethods,
          tags: context.tags,
          defaultCurrency: user.defaultCurrency,
          today: board.today,
          usedCurrencies: board.usedCurrencies,
          rates: board.rates,
        }}
      />
      <Dashboard data={dashboard} />
    </div>
  );
}
