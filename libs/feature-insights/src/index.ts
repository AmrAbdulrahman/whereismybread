// Client-safe surface. Server reads live in @wib/feature-insights/server.
export { InsightsView } from './components/insights-view';
export { saveInsightsLayoutAction } from './lib/actions';
export type { InsightsData } from './lib/insights';
export type {
  InsightsItem,
  NextMonthProjection,
  Unbudgeted,
} from './lib/insights-compute';
