// Client-safe surface. Server reads live in @wib/feature-insights/server.
export { InsightsView } from './components/insights-view';
export { Dashboard } from './components/dashboard';
export { saveInsightsLayoutAction } from './lib/actions';
export {
  addChartAction,
  deleteChartAction,
  reorderChartsAction,
  saveChartAction,
} from './lib/dashboard-actions';
export type { InsightsData } from './lib/insights';
export type { DashboardData, DashboardOption } from './lib/dashboard';
export type {
  InsightsItem,
  NextMonthProjection,
  Unbudgeted,
} from './lib/insights-compute';
export type { ChartSeries, SpendSource } from './lib/dashboard-compute';
