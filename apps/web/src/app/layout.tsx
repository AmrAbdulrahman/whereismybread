import './global.css';

import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { ToastProvider } from '@wmm/ui';
import { UpdatePrompt } from './_components/update-prompt';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: "Where's My Money",
    template: "%s · Where's My Money",
  },
  description:
    'Plan your money — upcoming payments, subscriptions, installments and debts, as a list or a calendar.',
};

export const viewport: Viewport = {
  themeColor: '#14171d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <ToastProvider>
          {children}
          <UpdatePrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
