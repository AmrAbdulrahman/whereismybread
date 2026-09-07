// Server-only surface (DB / auth reads). Import from route handlers and
// server components — never from a client component.
export { getInsightsData, type InsightsData } from './lib/insights';
export {
  getDashboardData,
  type DashboardData,
  type DashboardOption,
} from './lib/dashboard';
