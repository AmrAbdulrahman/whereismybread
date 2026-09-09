import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Where Is My Bread',
    short_name: 'Bread',
    description:
      'Same bread, smarter finances — plan upcoming payments, subscriptions, installments and debts.',
    id: '/plan',
    start_url: '/plan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Brand-purple native splash, matching <SplashScreen> and the iOS
    // launch images.
    background_color: '#6b3dff',
    theme_color: '#6b3dff',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
