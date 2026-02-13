import type { Metadata, Viewport } from 'next';

import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/layout/providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'Bible Study Journal',
  description: 'Privacy-first Bible study journal and progress tracker for households.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg'
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
