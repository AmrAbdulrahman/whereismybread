import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { Dashboard, InsightsView } from '@wib/feature-insights';
import { getDashboardData, getInsightsData } from '@wib/feature-insights/server';

export const metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; src?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { m, src } = await searchParams;
  const data = await getInsightsData();
  const dashboard = await getDashboardData(m, src);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-ink-soft">
          What&apos;s coming up and what needs a look. Drag cards to rearrange,
          or drag their right edge to resize.
        </p>
      </header>

      <InsightsView data={data} />
      <Dashboard data={dashboard} />
    </div>
  );
}
