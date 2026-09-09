'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn, TagInput } from '@wib/ui';
import { Plus } from '@wib/ui/icons';
import type { BudgetSummary } from '../lib/types';

export interface AssignOption {
  id: string;
  name: string;
  color: string;
}

/**
 * Non-closed budgets as pick options, de-duplicated by name (a recurring
 * monthly budget has one row per month — keep the most recent). The payment /
 * expense stores that row's id; the chip only ever shows its name + colour.
 */
export function budgetAssignOptions(budgets: BudgetSummary[]): AssignOption[] {
  const byName = new Map<string, BudgetSummary>();
  for (const b of budgets) {
    if (b.closedAt) continue;
    const key = b.name.toLowerCase();
    const seen = byName.get(key);
    if (!seen || b.startDate > seen.startDate) byName.set(key, b);
  }
  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id, name: b.name, color: b.color }));
}

/** The dashed "+ x" trigger pill shared by the assign + tag chips. */
function ChipButton({
  label,
  icon,
  open,
  onToggle,
  buttonRef,
}: {
  label: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  buttonRef: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`Add ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        // The pill stays tiny, but on touch an invisible padded hitbox around
        // it catches near-misses so they don't fall through to the
        // click-to-edit card underneath.
        'relative inline-flex items-center gap-0.5 rounded-full border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-accent/60 hover:text-ink',
        "max-sm:before:absolute max-sm:before:-inset-2 max-sm:before:content-['']",
        open && 'border-accent/60 text-ink',
      )}
    >
      <Plus size={10} strokeWidth={2.75} />
      {icon}
      {label}
    </button>
  );
}

/**
 * A floating menu anchored under `anchorRef`, rendered in a portal so an
 * ancestor's `opacity` (a paid / past occurrence dims its whole card) or
 * `overflow` never bleeds into it. Closes on outside click, Esc, scroll, resize.
 */
function AnchoredMenu({
  anchorRef,
  onClose,
  width = 200,
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
    // Keep the menu on screen — nudge left if it would overflow the right edge.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
  }, [anchorRef, width]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !menuRef.current?.contains(t) &&
        !anchorRef.current?.contains(t)
      ) {
        onClose();
        // The pointerdown that dismissed the menu would otherwise fall through
        // as a `click` to whatever it landed on (the card's click-to-edit, a
        // sibling chip, a link). Swallow that one click — wherever it is — so a
        // click-away only ever closes the menu.
        const swallow = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        document.addEventListener('click', swallow, {
          capture: true,
          once: true,
        });
        // No click follows a pointerdown on a scrollbar or the start of a drag —
        // drop the guard on the next tick so it can't eat an unrelated click.
        setTimeout(() => {
          document.removeEventListener('click', swallow, true);
        }, 0);
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
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
      className="z-50 rounded-lg border border-line-strong bg-surface p-1 shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * A light dashed "+ account" / "+ budget" pill for a plan card that has none.
 * Clicking opens a small menu to assign one inline — no edit modal. `onPick`
 * is fire-and-forget: the caller updates its own view optimistically and saves
 * in the background. Renders nothing when there are no options.
 */
export function InlineAssignChip({
  label,
  icon,
  options,
  onPick,
}: {
  /** The noun — the chip reads "+ {label}". */
  label: string;
  icon?: ReactNode;
  options: AssignOption[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (options.length === 0) return null;

  return (
    <span className="inline-flex">
      <ChipButton
        label={label}
        icon={icon}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        buttonRef={btnRef}
      />
      {open ? (
        <AnchoredMenu anchorRef={btnRef} onClose={() => setOpen(false)}>
          <div role="listbox" className="max-h-56 overflow-auto">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onPick(o.id);
                }}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-2"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: o.color }}
                />
                <span className="truncate">{o.name}</span>
              </button>
            ))}
          </div>
        </AnchoredMenu>
      ) : null}
    </span>
  );
}

/**
 * A "+ tag" pill that opens a multi-select (the shared `<TagInput>` — free
 * text + suggestions, create-on-the-fly). `onChange` fires on every edit with
 * the full tag-name list; the caller saves in the background. Always renders
 * (unlike the assign chips) since you can always coin a new tag.
 */
export function InlineTagChip({
  value,
  suggestions,
  onChange,
}: {
  value: string[];
  suggestions: { name: string; color: string }[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="inline-flex">
      <ChipButton
        label="tag"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        buttonRef={btnRef}
      />
      {open ? (
        <AnchoredMenu
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
          width={248}
        >
          <div className="p-1.5">
            <TagInput value={value} onChange={onChange} options={suggestions} />
          </div>
        </AnchoredMenu>
      ) : null}
    </span>
  );
}
