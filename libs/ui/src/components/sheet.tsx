'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/**
 * A Sheet is a Dialog that slides in from an edge. On mobile the create/edit
 * forms use `side="bottom"`.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheet = cva(
  'fixed z-50 flex flex-col border-line bg-surface shadow-xl focus:outline-none',
  {
    variants: {
      side: {
        bottom:
          'inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-2xl border-t',
        right:
          'inset-y-0 right-0 w-[min(24rem,100vw)] overflow-y-auto overflow-x-hidden border-l',
        left: 'inset-y-0 left-0 w-[min(20rem,100vw)] overflow-y-auto overflow-x-hidden border-r',
      },
    },
    defaultVariants: { side: 'bottom' },
  },
);

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheet> {
  /**
   * `side="bottom"` only: show a drag handle and let a downward drag (from the
   * top of the content) dismiss the sheet, the way a native bottom sheet does.
   */
  swipeToClose?: boolean;
}

/** How far the sheet must be dragged down before releasing dismisses it. */
const SWIPE_CLOSE_THRESHOLD = 96;

export const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, side, children, swipeToClose, style, ...props }, ref) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const [snapBack, setSnapBack] = useState(false);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref)
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref],
  );

  const swipeEnabled = Boolean(swipeToClose) && (side ?? 'bottom') === 'bottom';

  useEffect(() => {
    const el = contentRef.current;
    if (!el || !swipeEnabled) return;

    let startY = 0;
    let delta = 0;
    let active = false;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || e.touches.length !== 1 || el.scrollTop > 0) {
        active = false;
        return;
      }
      startY = touch.clientY;
      delta = 0;
      active = true;
      setSnapBack(false);
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!active || !touch) return;
      delta = touch.clientY - startY;
      if (delta <= 0) {
        setDragY(0);
        return;
      }
      if (el.scrollTop > 0) {
        active = false;
        setDragY(0);
        return;
      }
      // We own this gesture now — stop the scroll container from rubber-banding.
      e.preventDefault();
      setDragY(delta);
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (delta > SWIPE_CLOSE_THRESHOLD) closeRef.current?.click();
      else setSnapBack(true);
      setDragY(0);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [swipeEnabled]);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        ref={setRefs}
        className={cn(sheet({ side }), className)}
        style={{
          ...(dragY ? { transform: `translateY(${dragY}px)` } : null),
          transition: snapBack
            ? 'transform 0.2s ease-out'
            : dragY
              ? 'none'
              : undefined,
          ...style,
        }}
        {...props}
      >
        {swipeEnabled ? (
          <>
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line"
            />
            <DialogPrimitive.Close
              ref={closeRef}
              tabIndex={-1}
              aria-hidden
              className="sr-only"
            />
          </>
        ) : null}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = 'SheetContent';

export const SheetTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-lg font-semibold text-ink', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';
