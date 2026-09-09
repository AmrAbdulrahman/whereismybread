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
import { MoreVertical } from '@wib/ui/icons';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * A "⋮" overflow button that opens a small floating menu of row actions
 * (edit / flag / delete). Rendered in a portal so a dimmed / clipped ancestor
 * can't bleed into it. Every click is stopped from bubbling, so dropping this
 * inside a click-to-edit card row is safe.
 */
export function ActionMenu({
  items,
  label = 'More actions',
  className,
}: {
  items: ActionMenuItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) return null;

  return (
    <span className={cn('inline-flex shrink-0', className)}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          // Bigger, forgiving tap target on touch (the whole card is
          // click-to-edit, so a near-miss must not fall through to it); trims
          // back to the icon-sized hitbox from `sm` up.
          'relative grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:h-7 sm:w-7',
          "max-sm:before:absolute max-sm:before:-inset-x-1 max-sm:before:-inset-y-1.5 max-sm:before:content-['']",
          open && 'bg-surface-2 text-ink',
        )}
      >
        <MoreVertical size={15} strokeWidth={2} />
      </button>
      {open ? (
        <AnchoredMenu anchorRef={btnRef} onClose={() => setOpen(false)}>
          <div role="menu">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium hover:bg-surface-2',
                  item.danger ? 'text-danger' : 'text-ink-soft',
                )}
              >
                {item.icon ? (
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
              </button>
            ))}
          </div>
        </AnchoredMenu>
      ) : null}
    </span>
  );
}

/**
 * A menu anchored under `anchorRef`, portalled to `<body>`. Closes on outside
 * click, Esc, scroll and resize. (Mirrors the one in `inline-assign-chip`.)
 */
function AnchoredMenu({
  anchorRef,
  onClose,
  width = 176,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Right-align the menu to the button, nudged onto the screen.
    const left = Math.max(
      8,
      Math.min(r.right - width, window.innerWidth - width - 8),
    );
    setPos({ top: r.bottom + 4, left });
  }, [anchorRef, width]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !anchorRef.current?.contains(t)) {
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
    <>
      {/*
       * A transparent full-screen backdrop under the menu: a click-away lands
       * *on it*, never on the click-to-edit card row (or a link) underneath, so
       * dismissing the menu can't also open the edit modal. `stopPropagation`
       * keeps the click from bubbling the React portal tree back to the card.
       */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
        className="z-50 rounded-lg border border-line-strong bg-surface p-1 shadow-xl"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
