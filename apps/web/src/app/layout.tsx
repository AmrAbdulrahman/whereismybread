import './global.css';

import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { THEME_INIT_SCRIPT, ToastProvider } from '@wib/ui';
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
  metadataBase: new URL(process.env['APP_URL'] || 'http://localhost:3000'),
  applicationName: 'Where Is My Bread',
  title: {
    default: 'Where Is My Bread',
    template: '%s · Where Is My Bread',
  },
  description:
    'Plan your money — upcoming payments, subscriptions, installments and debts, as a list or a calendar.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Bread',
    // Opaque status bar — iOS reserves its space so content never hides
    // under the notch/clock (no per-screen safe-area padding needed).
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0c14' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Let the app paint under the notch / home indicator when installed.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        {/* Next emits `mobile-web-app-capable`; keep the legacy iOS name too so
            older iOS still launches the installed app without Safari chrome. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>
          {children}
          <UpdatePrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
