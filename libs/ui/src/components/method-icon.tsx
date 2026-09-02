import {
  ArrowLeftRight,
  Banknote,
  Bitcoin,
  Briefcase,
  CalendarDays,
  Coins,
  CreditCard,
  Gift,
  Globe,
  Handshake,
  House,
  Landmark,
  PiggyBank,
  QrCode,
  Receipt,
  Repeat,
  Send,
  Smartphone,
  Users,
  Wallet,
  type LucideIcon,
} from '../icons';
import { cn } from '../lib/cn';

const BY_KEY: Record<string, LucideIcon> = {
  wallet: Wallet,
  card: CreditCard,
  cash: Banknote,
  transfer: ArrowLeftRight,
  repeat: Repeat,
  calendar: CalendarDays,
  bank: Landmark,
  coins: Coins,
  piggy: PiggyBank,
  phone: Smartphone,
  send: Send,
  globe: Globe,
  crypto: Bitcoin,
  qr: QrCode,
  gift: Gift,
  receipt: Receipt,
  handshake: Handshake,
  people: Users,
  briefcase: Briefcase,
  home: House,
};

/** Icon keys offered in the method / recipient-method pickers. */
export const METHOD_ICON_KEYS = Object.keys(BY_KEY);

/**
 * A method's mark: its uploaded `logoUrl` image when set, otherwise the lucide
 * icon named by `iconKey`.
 */
export function MethodIcon({
  iconKey,
  logoUrl,
  size = 14,
  className,
}: {
  iconKey: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded-[3px] object-contain', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const Icon = BY_KEY[iconKey] ?? Wallet;
  return <Icon size={size} strokeWidth={2} className={className} />;
}
