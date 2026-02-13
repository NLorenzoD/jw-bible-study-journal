import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-xl border border-muted/20 bg-surface px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:ring-2',
        props.className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-xl border border-muted/20 bg-surface px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:ring-2',
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-xl border border-muted/20 bg-surface px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:ring-2',
        props.className
      )}
    />
  );
}
