import { getSql } from '../client';
import type {
  Account,
  Bank,
  Payment,
  PaymentAttachment,
  PaymentEvent,
  PaymentMethod,
  RecipientMethod,
  Tag,
} from '../schema/payments';
import type { MonthIncome } from '../schema/users';

/** An attachment as the board needs it (its `createdAt` comes back an ISO string). */
export type BoardAttachment = Pick<
  PaymentAttachment,
  'id' | 'name' | 'contentType' | 'size' | 'url' | 'pathname'
>;

/** A payment row with its tags (id/name/color) and attachments folded in. */
export type PaymentWithTags = Payment & {
  tags: Array<{ id: string; name: string; color: string }>;
  attachments: BoardAttachment[];
};

export interface BoardBundle {
  methods: PaymentMethod[];
  accounts: Account[];
  banks: Bank[];
  recipientMethods: RecipientMethod[];
  tags: Tag[];
  payments: PaymentWithTags[];
  events: PaymentEvent[];
  incomes: MonthIncome[];
}

const camelCache: Record<string, string> = {};
const toCamel = (s: string): string =>
  (camelCache[s] ??= s.replace(/_([a-z0-9])/g, (_, c: string) =>
    c.toUpperCase(),
  ));

/** snake_case → camelCase on a flat row (nested `tags` / `overrides` untouched). */
function camelRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[toCamel(key)] = row[key];
  return out as T;
}
function camelRows<T>(rows: unknown): T[] {
  return Array.isArray(rows)
    ? rows.map((r) => camelRow<T>(r as Record<string, unknown>))
    : [];
}

/**
 * Everything a board render needs, in **one** database round trip: the user's
 * method / account / bank / recipient / tag lists, their active payments (with
 * tags folded in), and the payment events + month-income overrides that fall in
 * the window. Exchange rates are fetched separately (a memoised global).
 *
 * Timestamp columns come back as ISO strings rather than `Date`s — the board
 * builder never reads them, so the return is cast to the Drizzle row types.
 */
export async function getBoardBundle(
  userId: string,
  window: {
    from: string;
    to: string;
    /** `YYYY-MM` bounds for the month-income lookup. */
    monthFrom: string;
    monthTo: string;
  },
): Promise<BoardBundle> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      methods: unknown;
      accounts: unknown;
      banks: unknown;
      recipient_methods: unknown;
      tags: unknown;
      payments: unknown;
      events: unknown;
      incomes: unknown;
    }>
  >`
    select
      coalesce((
        select jsonb_agg(to_jsonb(m) order by m.sort_order)
        from payment_methods m where m.user_id = ${userId}
      ), '[]'::jsonb) as methods,
      coalesce((
        select jsonb_agg(to_jsonb(a) order by a.sort_order)
        from accounts a where a.user_id = ${userId}
      ), '[]'::jsonb) as accounts,
      coalesce((
        select jsonb_agg(to_jsonb(bk) order by bk.sort_order)
        from banks bk where bk.user_id = ${userId}
      ), '[]'::jsonb) as banks,
      coalesce((
        select jsonb_agg(to_jsonb(r) order by r.sort_order)
        from recipient_methods r where r.user_id = ${userId}
      ), '[]'::jsonb) as recipient_methods,
      coalesce((
        select jsonb_agg(to_jsonb(t) order by lower(t.name))
        from tags t where t.user_id = ${userId}
      ), '[]'::jsonb) as tags,
      coalesce((
        select jsonb_agg(
          to_jsonb(p) || jsonb_build_object(
            'tags', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', tg.id, 'name', tg.name, 'color', tg.color))
              from payment_tags pt
              join tags tg on tg.id = pt.tag_id
              where pt.payment_id = p.id
            ), '[]'::jsonb),
            'attachments', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', att.id, 'name', att.name,
                'contentType', att.content_type, 'size', att.size,
                'url', att.url, 'pathname', att.pathname)
                order by att.created_at, att.id)
              from payment_attachments att
              where att.payment_id = p.id
            ), '[]'::jsonb)
          )
          order by p.created_at, p.id
        )
        from payments p
        where p.user_id = ${userId} and p.archived_at is null
      ), '[]'::jsonb) as payments,
      coalesce((
        select jsonb_agg(to_jsonb(e))
        from payment_events e
        where e.user_id = ${userId}
          and e.due_date between ${window.from} and ${window.to}
      ), '[]'::jsonb) as events,
      coalesce((
        select jsonb_agg(to_jsonb(mi))
        from month_incomes mi
        where mi.user_id = ${userId}
          and mi.month between ${window.monthFrom} and ${window.monthTo}
      ), '[]'::jsonb) as incomes
  `;

  const row = rows[0];
  return {
    methods: camelRows<PaymentMethod>(row?.methods),
    accounts: camelRows<Account>(row?.accounts),
    banks: camelRows<Bank>(row?.banks),
    recipientMethods: camelRows<RecipientMethod>(row?.recipient_methods),
    tags: camelRows<Tag>(row?.tags),
    payments: camelRows<PaymentWithTags>(row?.payments),
    events: camelRows<PaymentEvent>(row?.events),
    incomes: camelRows<MonthIncome>(row?.incomes),
  };
}
