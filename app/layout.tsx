import type { Metadata, Viewport } from 'next';

import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/layout/providers';

import './globals.css';

const siteName = 'Bible Study Journal';
const description = 'Privacy-first Bible study journal and progress tracker for households.';
const primarySiteUrl = 'https://jw-bible-study-journal.firebaseapp.com';

export const metadata: Metadata = {
  metadataBase: new URL(primarySiteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`
  },
  description,
  applicationName: siteName,
  alternates: {
    canonical: primarySiteUrl
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: primarySiteUrl,
    siteName,
    title: siteName,
    description,
    images: [
      {
        url: '/social/thumbnail.png',
        width: 1200,
        height: 630,
        alt: 'Bible Study Journal preview image'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description,
    images: ['/social/thumbnail.png']
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' }
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico'
  }
};

export const viewport: Viewport = {
  themeColor: '#ECE9DF'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
