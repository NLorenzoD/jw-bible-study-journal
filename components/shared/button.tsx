'use client';

import { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-bg shadow-glow hover:bg-accentStrong',
        variant === 'secondary' && 'bg-card text-ink ring-1 ring-muted/30 hover:bg-surface',
        variant === 'ghost' && 'bg-transparent text-ink hover:bg-card',
        className
      )}
      {...props}
    />
  );
}
