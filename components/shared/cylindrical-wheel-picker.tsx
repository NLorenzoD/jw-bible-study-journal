'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';

const ITEM_HEIGHT = 38;
const VISIBLE_ROWS = 5;
const CENTER_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

export interface WheelOption {
  value: string;
  label: string;
}

interface CylindricalWheelPickerProps {
  options: WheelOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  requireActivation?: boolean;
  tone?: 'accent' | 'blue';
  className?: string;
}

export function CylindricalWheelPicker({
  options,
  value,
  onChange,
  disabled = false,
  requireActivation = false,
  tone = 'accent',
  className
}: CylindricalWheelPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const deactivateTimerRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(!requireActivation);
  const selectedIndex = useMemo(() => Math.max(0, options.findIndex((entry) => entry.value === value)), [options, value]);
  const canInteract = !disabled && (!requireActivation || isActive);
  const toneClasses =
    tone === 'blue'
      ? 'border-sky-500/40 bg-sky-500/15 shadow-[0_0_24px_rgba(59,130,246,0.3)]'
      : 'border-accent/25 bg-accent/10 shadow-[0_0_24px_hsl(var(--accent)/0.2)]';
  const activationClasses =
    requireActivation && !disabled
      ? isActive
        ? 'border-accent/35 shadow-[0_0_0_1px_hsl(var(--accent)/0.25)]'
        : 'border-muted/25'
      : '';

  const clearDeactivateTimer = useCallback(() => {
    if (deactivateTimerRef.current !== null) {
      window.clearTimeout(deactivateTimerRef.current);
      deactivateTimerRef.current = null;
    }
  }, []);

  const scheduleDeactivate = useCallback(() => {
    if (!requireActivation || disabled) {
      return;
    }
    clearDeactivateTimer();
    deactivateTimerRef.current = window.setTimeout(() => setIsActive(false), 2200);
  }, [clearDeactivateTimer, disabled, requireActivation]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const targetTop = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(container.scrollTop - targetTop) > 1) {
      container.scrollTo({ top: targetTop, behavior: 'auto' });
    }
  }, [selectedIndex, options]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      clearDeactivateTimer();
    };
  }, [clearDeactivateTimer]);

  useEffect(() => {
    if (!requireActivation) {
      setIsActive(true);
      return;
    }
    if (disabled) {
      setIsActive(false);
      clearDeactivateTimer();
    }
  }, [clearDeactivateTimer, disabled, requireActivation]);

  useEffect(() => {
    if (!requireActivation || !isActive || disabled) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsActive(false);
      clearDeactivateTimer();
    }

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [clearDeactivateTimer, disabled, isActive, requireActivation]);

  return (
    <div
      ref={rootRef}
      onClick={() => {
        if (!requireActivation || disabled || isActive) {
          return;
        }
        setIsActive(true);
        scheduleDeactivate();
      }}
      className={cn('relative h-[190px] overflow-hidden rounded-2xl border border-muted/30 bg-surface/80', activationClasses, className)}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-surface to-transparent" />
      <div className={cn('pointer-events-none absolute inset-x-2 top-1/2 z-20 -translate-y-1/2 rounded-xl border', toneClasses)} style={{ height: ITEM_HEIGHT }} />

      <div
        ref={scrollRef}
        onScroll={() => {
          if (!canInteract) {
            return;
          }
          scheduleDeactivate();
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
          }
          rafRef.current = requestAnimationFrame(() => {
            const container = scrollRef.current;
            if (!container) {
              return;
            }
            const index = Math.round(container.scrollTop / ITEM_HEIGHT);
            const clampedIndex = Math.min(Math.max(index, 0), Math.max(0, options.length - 1));
            const selected = options[clampedIndex];
            if (selected && selected.value !== value) {
              onChange(selected.value);
            }
          });
        }}
        className={cn(
          'h-full snap-y snap-mandatory overflow-y-auto px-2 [&::-webkit-scrollbar]:hidden',
          disabled ? 'pointer-events-none opacity-75' : canInteract ? 'cursor-ns-resize' : 'pointer-events-none'
        )}
        style={{
          paddingTop: CENTER_PADDING,
          paddingBottom: CENTER_PADDING,
          scrollbarWidth: 'none',
          touchAction: canInteract ? 'pan-y' : 'auto'
        }}
        onTouchStart={() => {
          if (!canInteract) {
            return;
          }
          scheduleDeactivate();
        }}
      >
        {options.map((option, index) => {
          const distance = index - selectedIndex;
          const depth = Math.min(Math.abs(distance), 3);
          const rotate = distance * 18;
          const opacity = 1 - depth * 0.2;
          const scale = 1 - depth * 0.06;

          return (
            <div
              key={option.value}
              className="snap-center"
              style={{ height: ITEM_HEIGHT, transformStyle: 'preserve-3d' }}
            >
              <div
                className={cn(
                  'flex h-full items-center justify-center rounded-lg text-center text-sm transition',
                  index === selectedIndex ? 'font-semibold text-ink' : 'font-medium text-muted'
                )}
                style={{
                  opacity,
                  transform: `perspective(320px) rotateX(${rotate}deg) scale(${scale})`
                }}
              >
                {option.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
