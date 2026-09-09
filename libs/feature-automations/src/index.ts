// Client-safe surface. Server reads live in @wib/feature-automations/server.

export { AutomationsView } from './components/automations-view';
export {
  AutomationForm,
  type AutomationFormInitial,
} from './components/automation-form';
export { NotificationsView } from './components/notifications-view';
export { NotificationsBell } from './components/notifications-bell';
export { PushNudge } from './components/push-nudge';

export {
  saveAutomationAction,
  deleteAutomationAction,
  toggleAutomationAction,
  reorderAutomationsAction,
  runAutomationNowAction,
  markNotificationsReadAction,
  loadNotificationsAction,
  savePushSubscriptionAction,
  deletePushSubscriptionAction,
  updateNotificationPrefsAction,
  type SaveAutomationResult,
  type NotificationsPageResult,
} from './lib/actions';

export { NotificationsSettings } from './components/notifications-settings';

export {
  automationFormSchema,
  type AutomationFormValues,
} from './lib/schema';

export {
  TRIGGER_LABELS,
  TRIGGER_HINTS,
  OPERATOR_LABELS,
  ACTION_LABELS,
  NOTIFY_CHANNEL_LABELS,
} from './lib/labels';

export type {
  AutomationLookups,
  AutomationsData,
  NotificationsData,
} from './lib/queries';
