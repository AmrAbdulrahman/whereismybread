import type { ImgHTMLAttributes, SVGProps } from 'react';
import { cn } from '../lib/cn';

/**
 * The "Where Is My Bread" loaf mark — a stroke-only bread silhouette that
 * inherits `currentColor`. Kept for monochrome contexts; most surfaces should
 * use <BreadSlice>.
 */
export function BreadMark({
  size = 24,
  strokeWidth = 3,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.5 21.5a15.5 13 0 0 1 31 0V37a3.5 3.5 0 0 1-3.5 3.5H12A3.5 3.5 0 0 1 8.5 37Z" />
    </svg>
  );
}

/**
 * The brand bread-slice logo — the master artwork at `apps/web/public/brand/bread.png`,
 * used verbatim. Served from the web root, so this component assumes an
 * `apps/web`-style public dir. Regenerate the derived favicons / app icons from
 * the same master with `node scripts/gen-brand-assets.mjs`.
 */
export function BreadSlice({
  size = 32,
  title,
  className,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> & {
  size?: number;
  title?: string;
}) {
  return (
    <img
      src="/brand/bread.png"
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      className={cn('inline-block object-contain', className)}
      {...props}
    />
  );
}
