import { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-muted/20 bg-card/90 p-4 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.5)] backdrop-blur',
        className
      )}
      {...props}
    />
  );
}
