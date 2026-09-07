import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { InsightsView } from '@wib/feature-insights';
import { getInsightsData } from '@wib/feature-insights/server';

export const metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const data = await getInsightsData();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-ink-soft">
          What&apos;s coming up and what needs a look. Drag cards to rearrange,
          or drag their right edge to resize.
        </p>
      </header>

      <InsightsView data={data} />
    </div>
  );
}
