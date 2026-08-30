import type { SVGProps } from 'react';

/**
 * The "Where Is My Bread" loaf mark — a stroke-only bread silhouette that
 * inherits `currentColor`, so it themes with the accent.
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
