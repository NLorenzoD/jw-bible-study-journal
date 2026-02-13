import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bible Study Journal',
    short_name: 'Bible Journal',
    description: 'Privacy-first Bible study journal and progress tracker.',
    start_url: '/today',
    display: 'standalone',
    background_color: '#ECE9DF',
    theme_color: '#ECE9DF',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
