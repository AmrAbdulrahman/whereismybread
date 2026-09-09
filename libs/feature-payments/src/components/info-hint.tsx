'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@wib/ui';
import { Info } from '@wib/ui/icons';

/**
 * A small "ⓘ" button that reveals a one-line explanation on tap / click.
 * Portalled to `<body>` so a sticky, clipped or dimmed ancestor can't crop
 * it; closes on outside click, Esc, scroll or resize. (Mirrors the anchored
 * menu in `action-menu`.)
 */
export function InfoHint({
  children,
  label = 'More info',
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <span className={cn('inline-flex', className)}>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-ink',
          open && 'text-ink',
        )}
      >
        <Info size={12} strokeWidth={2} />
      </button>
      {open ? (
        <HintBubble anchorRef={btnRef} onClose={() => setOpen(false)}>
          {children}
        </HintBubble>
      ) : null}
    </span>
  );
}

function HintBubble({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const width = 224;

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Centre the bubble under the icon, nudged fully onto the screen.
    const left = Math.max(
      8,
      Math.min(
        r.left + r.width / 2 - width / 2,
        window.innerWidth - width - 8,
      ),
    );
    setPos({ top: r.bottom + 6, left });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!bubbleRef.current?.contains(t) && !anchorRef.current?.contains(t)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose]);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={bubbleRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
      className="z-50 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-normal leading-snug text-ink-soft shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}
