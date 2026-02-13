'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Flame, FolderKanban, Highlighter, Settings } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

const items = [
  { href: '/today', label: 'Today', icon: Flame },
  { href: '/progress', label: 'Progress', icon: BookOpen },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/highlights', label: 'Highlights', icon: Highlighter },
  { href: '/settings', label: 'Settings', icon: Settings }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-muted/20 bg-card/95 backdrop-blur">
      <ul className="mx-auto grid max-w-screen-sm grid-cols-5 px-2 py-1">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition',
                  active ? 'text-accent' : 'text-muted hover:text-ink'
                )}
              >
                <Icon className={cn('h-4 w-4', active && 'scale-110')} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
