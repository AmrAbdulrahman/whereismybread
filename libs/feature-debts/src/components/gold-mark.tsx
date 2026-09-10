import { GOLD_TYPE_BY_KEY } from '@wib/domain';
import { Coins, Layers, Scale } from '@wib/ui/icons';

/** A small mark for a gold type — by family: carat (weight), coin, bar. */
export function GoldMark({
  type,
  size = 14,
  className,
}: {
  type: string;
  size?: number;
  className?: string;
}) {
  const group = GOLD_TYPE_BY_KEY.get(type)?.group;
  const Icon = group === 'coin' ? Coins : group === 'bar' ? Layers : Scale;
  return (
    <Icon
      size={size}
      strokeWidth={2}
      className={className ?? 'text-warn'}
      aria-hidden
    />
  );
}
