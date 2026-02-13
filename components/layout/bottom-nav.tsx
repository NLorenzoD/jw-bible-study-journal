'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Flame, FolderKanban, Highlighter, Settings } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

const items = [
  {
    href: '/today',
    label: 'Today',
    icon: Flame,
    activeText: 'text-emerald-700 dark:text-emerald-300',
    activePill: 'border-emerald-500/40 bg-emerald-500/15',
    activeDot: 'bg-emerald-500'
  },
  {
    href: '/progress',
    label: 'Progress',
    icon: BookOpen,
    activeText: 'text-sky-700 dark:text-sky-300',
    activePill: 'border-sky-500/40 bg-sky-500/15',
    activeDot: 'bg-sky-500'
  },
  {
    href: '/projects',
    label: 'Projects',
    icon: FolderKanban,
    activeText: 'text-amber-700 dark:text-amber-300',
    activePill: 'border-amber-500/40 bg-amber-500/15',
    activeDot: 'bg-amber-500'
  },
  {
    href: '/highlights',
    label: 'Highlights',
    icon: Highlighter,
    activeText: 'text-rose-700 dark:text-rose-300',
    activePill: 'border-rose-500/40 bg-rose-500/15',
    activeDot: 'bg-rose-500'
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    activeText: 'text-violet-700 dark:text-violet-300',
    activePill: 'border-violet-500/40 bg-violet-500/15',
    activeDot: 'bg-violet-500'
  }
];

export function BottomNav() {
  const pathname = usePathname();
  const normalizedPath = (() => {
    if (!pathname) {
      return '/';
    }
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed.length ? trimmed : '/';
  })();

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[30rem] -translate-x-1/2 border-x border-t border-muted/20 bg-card/95 backdrop-blur">
      <ul className="mx-auto grid grid-cols-5 px-2 py-1">
        {items.map((item) => {
          const active =
            normalizedPath === item.href ||
            normalizedPath.startsWith(`${item.href}/`) ||
            (item.href === '/today' && normalizedPath === '/');
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition',
                  active ? cn(item.activeText, 'font-semibold') : 'text-muted hover:text-ink'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="active-nav-top-line"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    className={cn('absolute inset-x-3 top-0 h-0.5 rounded-full', item.activeDot)}
                  />
                )}
                {active && (
                  <motion.span
                    layoutId="active-nav-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className={cn('absolute inset-0 rounded-xl border', item.activePill)}
                  />
                )}
                <Icon className={cn('relative z-10 h-4 w-4 transition-transform duration-200', active && 'scale-110')} />
                <span className="relative z-10">{item.label}</span>
                {active && (
                  <motion.span
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16 }}
                    className={cn('relative z-10 h-1 w-1 rounded-full', item.activeDot)}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
