import './global.css';

import type { Metadata, Viewport } from 'next';
import { Fredoka, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import {
  SPLASH_CSS,
  SPLASH_HIDE_SCRIPT,
  SplashScreen,
  THEME_INIT_SCRIPT,
  ToastProvider,
} from '@wib/ui';
import { UpdatePrompt } from './_components/update-prompt';

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fredoka',
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

/**
 * iOS PWA launch images. `[basename, cssWidth, cssHeight, dpr]` — the curated
 * set in `apps/web/public/splash/` (bread mark on brand purple), one
 * `<basename>_portrait.png` + `<basename>_landscape.png` per device family.
 * Media queries match iOS's natural (portrait) device metrics + orientation.
 * The in-app `<SplashScreen>` takes over once the webview loads.
 */
const APPLE_SPLASH: [string, number, number, number][] = [
  ['iPhone_17_Pro_Max__iPhone_16_Pro_Max', 440, 956, 3],
  ['iPhone_17_Pro__iPhone_17__iPhone_16_Pro', 402, 874, 3],
  ['iPhone_Air', 420, 912, 3],
  ['iPhone_16_Plus__iPhone_15_Pro_Max__iPhone_15_Plus__iPhone_14_Pro_Max', 430, 932, 3],
  ['iPhone_16__iPhone_15_Pro__iPhone_15__iPhone_14_Pro', 393, 852, 3],
  ['iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max', 428, 926, 3],
  ['iPhone_17e__iPhone_16e__iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12', 390, 844, 3],
  ['iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X', 375, 812, 3],
  ['iPhone_11_Pro_Max__iPhone_XS_Max', 414, 896, 3],
  ['iPhone_11__iPhone_XR', 414, 896, 2],
  ['iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus', 414, 736, 3],
  ['iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE', 375, 667, 2],
  ['4__iPhone_SE__iPod_touch_5th_generation_and_later', 320, 568, 2],
  ['13__iPad_Pro_M4', 1032, 1376, 2],
  ['12.9__iPad_Pro', 1024, 1366, 2],
  ['11__iPad_Pro_M4', 834, 1210, 2],
  ['11__iPad_Pro__10.5__iPad_Pro', 834, 1194, 2],
  ['10.9__iPad_Air', 820, 1180, 2],
  ['10.5__iPad_Air', 834, 1112, 2],
  ['10.2__iPad', 810, 1080, 2],
  ['9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad', 768, 1024, 2],
  ['8.3__iPad_Mini', 744, 1133, 2],
];

export const metadata: Metadata = {
  metadataBase: new URL(process.env['APP_URL'] || 'http://localhost:3000'),
  applicationName: 'Where Is My Bread',
  title: {
    default: 'Where Is My Bread',
    template: '%s · Where Is My Bread',
  },
  description:
    'Same bread, smarter finances — plan upcoming payments, subscriptions, installments and debts, as a list or a calendar.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Bread',
    // Opaque status bar — iOS reserves its space so content never hides
    // under the notch/clock (no per-screen safe-area padding needed).
    statusBarStyle: 'default',
    startupImage: APPLE_SPLASH.flatMap(([base, w, h, dpr]) => {
      const q = `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr})`;
      return [
        {
          url: `/splash/${base}_portrait.png`,
          media: `${q} and (orientation: portrait)`,
        },
        {
          url: `/splash/${base}_landscape.png`,
          media: `${q} and (orientation: landscape)`,
        },
      ];
    }),
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // `theme-color` (status-bar / notch fill) is managed by THEME_INIT_SCRIPT and
  // `applyTheme` so it tracks the in-app light/dark toggle, not just the OS —
  // a `prefers-color-scheme`-scoped tag here would go stale on manual toggle.
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
      className={`dark ${fredoka.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        {/* Next emits `mobile-web-app-capable`; keep the legacy iOS name too so
            older iOS still launches the installed app without Safari chrome. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_HIDE_SCRIPT }} />
      </head>
      <body>
        <SplashScreen />
        <ToastProvider>
          {children}
          <UpdatePrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
