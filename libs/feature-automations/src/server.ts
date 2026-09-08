// Server-only surface (DB / auth / engine). Import from route handlers,
// server components and other server-only modules — never a client component.

export {
  getAutomationsData,
  getNotificationsData,
  getUnreadNotificationCount,
  type AutomationsData,
  type AutomationLookups,
  type NotificationsData,
} from './lib/queries';

export {
  runReviewExpenseAutomations,
  runRecordAutomations,
  runAutomationNow,
  countMatchingPending,
  notifySyncComplete,
  type RecordSubjectInput,
  type ReviewAutomationOutcome,
} from './lib/engine';

export { sendPushToUser } from './lib/push';
