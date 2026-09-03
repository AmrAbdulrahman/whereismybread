import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { BankManager } from '@wib/feature-payments';
import { getBanks } from '@wib/feature-payments/server';

export const metadata = { title: 'Banks' };
export const dynamic = 'force-dynamic';

export default async function BanksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const banks = await getBanks();
  return (
    <BankManager
      items={banks.map((b) => ({
        id: b.id,
        name: b.name,
        color: b.color,
        usageCount: b.paymentCount,
        mark: { iconKey: b.iconKey, logoUrl: b.logoUrl },
      }))}
    />
  );
}
