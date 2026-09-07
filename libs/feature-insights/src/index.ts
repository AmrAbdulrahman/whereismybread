// Client-safe surface. Server reads live in @wib/feature-insights/server.
export { InsightsView } from './components/insights-view';
export { Dashboard } from './components/dashboard';
export { saveInsightsLayoutAction } from './lib/actions';
export {
  addChartAction,
  addStatAction,
  deleteChartAction,
  previewChartAction,
  previewStatAction,
  reorderChartsAction,
  saveChartAction,
  type ChartPreview,
} from './lib/dashboard-actions';
export type { InsightsData } from './lib/insights';
export type {
  DashboardData,
  DashboardOption,
  StatCardData,
} from './lib/dashboard';
export type {
  InsightsItem,
  NextMonthProjection,
  Unbudgeted,
} from './lib/insights-compute';
export type {
  ChartSeries,
  SeriesPoint,
  SpendSource,
  SpendFilterConfig,
  StatMeasure,
  StatResult,
  ChartGroupBy,
  ChartDisplay,
} from './lib/dashboard-compute';
