import { goldMarkSpec } from '@wib/domain';

/**
 * A small drawn mark for a built-in gold type: a rimmed golden coin with a
 * letter, or a golden bar stamped with its purity + weight. Hover shows the
 * full name. Gold keeps its colour in both themes on purpose.
 */
export function GoldMark({
  type,
  size = 16,
  className,
}: {
  type: string;
  size?: number;
  className?: string;
}) {
  const spec = goldMarkSpec(type);
  const gid = 'wib-gold-grad';
  const face = `url(#${gid})`;
  const rim = '#8a6d1f';
  const ink = '#3f3007';

  const defs = (
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6e27a" />
        <stop offset="0.5" stopColor="#e3bd47" />
        <stop offset="1" stopColor="#c99a24" />
      </linearGradient>
    </defs>
  );

  if (!spec || spec.shape === 'coin') {
    const glyph = spec?.glyph ?? '';
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        role="img"
        aria-label={spec?.title ?? 'Gold coin'}
      >
        <title>{spec?.title ?? 'Gold coin'}</title>
        {defs}
        <circle cx="12" cy="12" r="11" fill={face} stroke={rim} strokeWidth="1" />
        <circle cx="12" cy="12" r="8.5" fill="none" stroke={rim} strokeWidth="0.9" opacity="0.7" />
        <text
          x="12"
          y="12.2"
          textAnchor="middle"
          dominantBaseline="central"
          fill={ink}
          fontSize={glyph.length > 1 ? 8 : 11}
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {glyph}
        </text>
      </svg>
    );
  }

  // bar
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={spec.title}
    >
      <title>{spec.title}</title>
      {defs}
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="2.5"
        fill={face}
        stroke={rim}
        strokeWidth="1"
      />
      <rect
        x="5.5"
        y="6.5"
        width="13"
        height="11"
        rx="1.5"
        fill="none"
        stroke={rim}
        strokeWidth="0.7"
        opacity="0.6"
      />
      <text
        x="12"
        y={spec.sub ? 10.5 : 12.2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontSize="6.5"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {spec.glyph}
      </text>
      {spec.sub ? (
        <text
          x="12"
          y="15"
          textAnchor="middle"
          dominantBaseline="central"
          fill={ink}
          fontSize="5.5"
          fontWeight="600"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {spec.sub}
        </text>
      ) : null}
    </svg>
  );
}
