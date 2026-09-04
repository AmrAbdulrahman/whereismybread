import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Where Is My Bread',
    short_name: 'Bread',
    description:
      'Plan your money — upcoming payments, subscriptions, installments and debts.',
    id: '/plan',
    start_url: '/plan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0e0c14',
    theme_color: '#6321d6',
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
