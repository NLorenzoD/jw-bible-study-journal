import Link from 'next/link';

import { Card } from '@/components/shared/card';

export default function OfflinePage() {
  return (
    <Card className="space-y-2">
      <h1 className="font-display text-2xl text-ink">You are offline</h1>
      <p className="text-sm text-muted">
        Entries are still saved locally. Once your connection returns, pending updates will sync automatically.
      </p>
      <Link href="/today" className="text-sm font-semibold text-accent">
        Return to Today
      </Link>
    </Card>
  );
}
