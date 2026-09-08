import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { AutomationsView } from '@wib/feature-automations';
import { getAutomationsData } from '@wib/feature-automations/server';

export const metadata = { title: 'Automations' };
export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { automations, lookups } = await getAutomationsData(user.id);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Automations</h1>
        <p className="text-ink-soft">
          When an expense for review comes in, or you add a payment, run a
          pattern and take actions automatically — tag it, file it, ignore it,
          or ping you.
        </p>
      </header>
      <AutomationsView automations={automations} lookups={lookups} />
    </div>
  );
}
