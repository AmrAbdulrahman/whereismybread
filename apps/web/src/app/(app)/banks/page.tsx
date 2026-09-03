import { redirect } from 'next/navigation';
import { getCurrentUser } from '@wib/auth/server';
import { LabelManager } from '@wib/ui';
import {
  deleteBankAction,
  listBanksAction,
  saveBankAction,
} from '@wib/feature-payments';
import { getBanks } from '@wib/feature-payments/server';

export const metadata = { title: 'Banks' };
export const dynamic = 'force-dynamic';

export default async function BanksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const banks = await getBanks();
  return (
    <LabelManager
      title="Banks"
      noun="bank"
      usageNoun="payment"
      deleteImpact="unlink"
      description="The bank behind a direct-debit or card payment."
      namePlaceholder="Monzo, Barclays, Revolut…"
      items={banks.map((b) => ({
        id: b.id,
        name: b.name,
        color: b.color,
        usageCount: b.paymentCount,
      }))}
      onSave={saveBankAction}
      onDelete={deleteBankAction}
      onRefresh={listBanksAction}
    />
  );
}
