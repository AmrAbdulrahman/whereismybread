# feature-insights

The Insights page (`/insights`): read-only summary cards ("Coming up", "Needs your
attention") derived from the plan board, budgets, expenses and bank sync. A configurable
Recharts dashboard is planned as a second phase.

Unusually for a `type:feature` lib, this one may depend on `@wib/feature-payments` — the
module-boundary rule was relaxed to allow feature→feature imports so insights can reuse
its board/budget/expense queries rather than duplicating them.
