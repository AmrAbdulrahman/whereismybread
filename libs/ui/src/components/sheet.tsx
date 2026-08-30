import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
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
          'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
        right: 'inset-y-0 right-0 w-[min(24rem,100vw)] border-l',
        left: 'inset-y-0 left-0 w-[min(20rem,100vw)] border-r',
      },
    },
    defaultVariants: { side: 'bottom' },
  },
);

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheet> {}

export const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, side, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheet({ side }), className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
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
