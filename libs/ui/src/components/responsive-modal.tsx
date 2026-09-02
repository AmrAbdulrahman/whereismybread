'use client';

import type { ReactNode } from 'react';
import { useMediaQuery } from '../lib/use-media-query';
import { cn } from '../lib/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './dialog';
import { Sheet, SheetContent, SheetTitle } from './sheet';

export interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Extra classes for the content surface. */
  className?: string;
}

/** A dialog on `lg` and up, a bottom sheet below it. */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto',
            className,
          )}
        >
          <DialogTitle className="mb-1">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mb-4">
              {description}
            </DialogDescription>
          ) : null}
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn('max-h-[92dvh] overflow-y-auto p-5', className)}
      >
        <SheetTitle className="mb-1">{title}</SheetTitle>
        {description ? (
          <p className="mb-4 text-sm text-ink-soft">{description}</p>
        ) : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}
