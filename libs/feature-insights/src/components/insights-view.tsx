'use client';

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { cn } from '@wib/ui';
import {
  ArrowLeftRight,
  CalendarDays,
  Flag,
  GripVertical,
  PiggyBank,
  Receipt,
  Repeat,
  TriangleAlert,
} from '@wib/ui/icons';
import { saveInsightsLayoutAction } from '../lib/actions';
import type { InsightsData } from '../lib/insights';
import { InsightCard } from './insight-card';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

interface Card {
  id: string;
  node: ReactNode;
}
interface Section {
  key: string;
  title: string;
  emptyNode: ReactNode;
  cards: Card[];
}

type Order = Record<string, string[]>;
type Spans = Record<string, number>;

/** Sort `cards` by `ids`; anything not in `ids` keeps its natural order at the end. */
function applyOrder(cards: Card[], ids: string[] | undefined): Card[] {
  if (!ids || ids.length === 0) return cards;
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...cards].sort(
    (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999),
  );
}

function DraggableCard({
  id,
  span,
  onDropBefore,
  onSpanChange,
  onCommit,
  children,
}: {
  id: string;
  span: number;
  onDropBefore: (draggedId: string, targetId: string) => void;
  onSpanChange: (id: string, span: number) => void;
  onCommit: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [resizing, setResizing] = useState(false);

  // Drag the right edge; snap to whole grid columns.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = ref.current?.parentElement;
    if (!grid) return;
    const styles = getComputedStyle(grid);
    const cols = styles.gridTemplateColumns
      .split(' ')
      .filter(Boolean).length;
    const gap = parseFloat(styles.columnGap) || 0;
    const unit = (grid.getBoundingClientRect().width - gap * (cols - 1)) / cols;
    const startX = e.clientX;
    const startSpan = span;
    setResizing(true);

    const onMove = (ev: MouseEvent) => {
      const deltaCols = Math.round((ev.clientX - startX) / (unit + gap));
      const next = Math.min(cols, Math.max(1, startSpan + deltaCols));
      if (next !== span) onSpanChange(id, next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizing(false);
      onCommit();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // The whole card is the drag target (a plain click never starts a drag);
  // the grip is just an affordance. Interactive children set `draggable={false}`
  // so a link-drag doesn't hijack the card drag.
  return (
    <div
      ref={ref}
      draggable={!resizing}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dragged = e.dataTransfer.getData('text/plain');
        if (dragged && dragged !== id) onDropBefore(dragged, id);
      }}
      className={cn(
        'group relative rounded-xl',
        (dragging || resizing) && 'opacity-50',
        over && 'ring-2 ring-accent ring-offset-2 ring-offset-ground',
      )}
    >
      <span className="pointer-events-none absolute right-2 top-2 z-10 hidden rounded p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 sm:block">
        <GripVertical size={15} />
      </span>
      <span
        role="separator"
        aria-label="Resize card"
        draggable={false}
        onMouseDown={startResize}
        className="absolute -right-1.5 top-1/2 z-10 hidden h-10 w-3 -translate-y-1/2 cursor-col-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 sm:flex"
      >
        <span className="h-8 w-1 rounded-full bg-line-strong" />
      </span>
      {children}
    </div>
  );
}

export function InsightsView({ data }: { data: InsightsData }) {
  const { comingUp, attention } = data;

  const sections: Section[] = useMemo(() => {
    const cu: Card[] = [];
    if (comingUp.bigSoon.length > 0) {
      cu.push({
        id: 'big-soon',
        node: (
          <InsightCard
            icon={TriangleAlert}
            title="Big charges soon"
            tone="warn"
            summary={`${plural(comingUp.bigSoon.length, 'charge')} of £30+ in the next 10 days`}
            items={comingUp.bigSoon}
            viewAllHref="/plan"
          />
        ),
      });
    }
    if (comingUp.annualOrOneTime.length > 0) {
      cu.push({
        id: 'annual-oneoff',
        node: (
          <InsightCard
            icon={CalendarDays}
            title="Annual & one-off payments"
            summary={`${plural(comingUp.annualOrOneTime.length, 'payment')} in the next 4 months`}
            items={comingUp.annualOrOneTime}
            viewAllHref="/plan"
          />
        ),
      });
    }
    if (comingUp.annualRenewals.length > 0) {
      cu.push({
        id: 'renewals',
        node: (
          <InsightCard
            icon={Repeat}
            title="Subscriptions renewing"
            summary={`${plural(comingUp.annualRenewals.length, 'annual subscription')} renewing in the next 4 months`}
            items={comingUp.annualRenewals}
            viewAllHref="/subscriptions"
          />
        ),
      });
    }

    const at: Card[] = [];
    if (attention.reviewCount > 0) {
      at.push({
        id: 'review',
        node: (
          <InsightCard
            icon={ArrowLeftRight}
            title="Transactions to review"
            tone="warn"
            summary={`${plural(attention.reviewCount, 'imported transaction')} waiting to be categorised`}
          >
            <Link
              href="/integrations"
              draggable={false}
              className="self-start rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink"
            >
              Open Integrations →
            </Link>
          </InsightCard>
        ),
      });
    }
    if (attention.flagged.length > 0) {
      at.push({
        id: 'flagged',
        node: (
          <InsightCard
            icon={Flag}
            title="Flagged payments"
            tone="danger"
            summary={plural(attention.flagged.length, 'flagged payment')}
            items={attention.flagged}
            viewAllHref="/plan"
          />
        ),
      });
    }
    if (attention.overBudget.length > 0) {
      at.push({
        id: 'over-budget',
        node: (
          <InsightCard
            icon={PiggyBank}
            title="Budgets over or nearly over"
            tone="warn"
            summary={`${plural(attention.overBudget.length, 'budget')} at 90%+ used`}
            items={attention.overBudget}
            viewAllHref="/budgets"
          />
        ),
      });
    }
    if (attention.nextMonthProjection) {
      at.push({
        id: 'next-month',
        node: (
          <InsightCard
            icon={TriangleAlert}
            title="Next month looks tight"
            tone={attention.nextMonthProjection.overBy ? 'danger' : 'warn'}
            summary={attention.nextMonthProjection.label}
          >
            {attention.nextMonthProjection.overBy ? (
              <p className="text-xs text-danger">
                Over by {attention.nextMonthProjection.overBy}. Consider moving
                or trimming a payment.
              </p>
            ) : null}
          </InsightCard>
        ),
      });
    }
    if (attention.unbudgeted) {
      at.push({
        id: 'unbudgeted',
        node: (
          <InsightCard
            icon={Receipt}
            title="Unbudgeted spending this month"
            summary={`${attention.unbudgeted.totalLabel} across ${plural(attention.unbudgeted.count, 'expense')} with no budget`}
          >
            <p className="text-xs text-ink-soft">
              {attention.unbudgeted.suggestion}
            </p>
            <Link
              href="/budgets"
              draggable={false}
              className="self-start rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink"
            >
              Create a budget →
            </Link>
          </InsightCard>
        ),
      });
    }

    return [
      {
        key: 'comingUp',
        title: 'Coming up',
        emptyNode: (
          <p className="rounded-xl border border-dashed border-line-strong py-8 text-center text-sm text-ink-soft">
            Nothing big or unusual in the next few months.
          </p>
        ),
        cards: cu,
      },
      {
        key: 'attention',
        title: 'Needs your attention',
        emptyNode: (
          <p className="rounded-xl border border-teal/30 bg-teal/5 py-8 text-center text-sm text-teal">
            All clear — nothing needs you right now.
          </p>
        ),
        cards: at,
      },
    ];
  }, [comingUp, attention]);

  const [order, setOrder] = useState<Order>(data.layout.order);
  const [spans, setSpans] = useState<Spans>(data.layout.spans);
  const [, startSave] = useTransition();
  // Latest committed snapshot, updated every render — used by the resize
  // "commit on mouse-up" path.
  const latest = useRef({ order, spans });
  latest.current = { order, spans };

  const persist = (next: { order: Order; spans: Spans }) =>
    startSave(async () => {
      await saveInsightsLayoutAction(next);
    });

  const setSpan = (id: string, span: number) =>
    setSpans((prev) => (prev[id] === span ? prev : { ...prev, [id]: span }));

  const move = (sectionKey: string, allCards: Card[]) =>
    (draggedId: string, targetId: string) => {
      const current = applyOrder(allCards, order[sectionKey]).map((c) => c.id);
      const from = current.indexOf(draggedId);
      const to = current.indexOf(targetId);
      if (from === -1 || to === -1) return;
      current.splice(from, 1);
      current.splice(to, 0, draggedId);
      const nextOrder = { ...order, [sectionKey]: current };
      setOrder(nextOrder);
      persist({ order: nextOrder, spans });
    };

  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => {
        const cards = applyOrder(s.cards, order[s.key]);
        return (
          <section key={s.key} className="flex flex-col gap-3">
            <h2 className="font-display text-base font-semibold text-ink">
              {s.title}
            </h2>
            {cards.length === 0 ? (
              s.emptyNode
            ) : (
              <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((c) => (
                  <DraggableCard
                    key={c.id}
                    id={c.id}
                    span={spans[c.id] ?? 1}
                    onDropBefore={move(s.key, s.cards)}
                    onSpanChange={setSpan}
                    onCommit={() => persist(latest.current)}
                  >
                    {c.node}
                  </DraggableCard>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
