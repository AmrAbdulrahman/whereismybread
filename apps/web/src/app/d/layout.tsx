import type { ReactNode } from 'react';

export const metadata = { title: 'Shared debt' };

export default function SharedDebtLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-ground px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
