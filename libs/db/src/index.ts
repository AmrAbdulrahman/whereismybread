export { getDb, getSql, type Db } from './lib/client';
export { checkDatabase, type DbHealth } from './lib/health';
export { fetchBranding, type Branding } from './lib/branding';
export * as schema from './lib/schema/index';
export type { User, NewUser, MonthIncome } from './lib/schema/users';
export type {
  Tag,
  Account,
  Bank,
  PaymentMethod,
  RecipientMethod,
  Payment,
  NewPayment,
  PaymentEvent,
  PaymentLineItem,
  PaymentAttachment,
} from './lib/schema/payments';
export type {
  Budget,
  NewBudget,
  Expense,
  NewExpense,
  ExpenseAttachment,
} from './lib/schema/budgets';
export type {
  StatementImport,
  NewStatementImport,
  BankTransaction,
  NewBankTransaction,
  BankConnection,
  NewBankConnection,
  BankAccount,
  NewBankAccount,
} from './lib/schema/bank-sync';

export {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserProfile,
  updateUserPreferences,
  updateUserNotificationPrefs,
  updateUserPassword,
  markEmailVerified,
} from './lib/repositories/users';

export {
  listPushSubscriptions,
  savePushSubscription,
  deletePushSubscription,
  type PushSubscriptionInput,
} from './lib/repositories/push';
export type {
  PushSubscriptionRow,
  NewPushSubscriptionRow,
} from './lib/schema/push';

export {
  listMonthIncomes,
  setMonthIncome,
  clearMonthIncome,
} from './lib/repositories/month-incomes';

export {
  createPasswordResetToken,
  findLivePasswordResetToken,
  markPasswordResetTokenUsed,
  deleteUserPasswordResetTokens,
  createEmailVerificationToken,
  findLiveEmailVerificationToken,
  markEmailVerificationTokenUsed,
  deleteUserEmailVerificationTokens,
} from './lib/repositories/auth-tokens';

export {
  listPaymentMethods,
  ensureDefaultMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from './lib/repositories/payment-methods';

export {
  listTags,
  listTagsWithUsage,
  createTag,
  updateTag,
  getOrCreateTags,
  getTagByName,
  deleteTag,
  tagsByIds,
  type TagWithUsage,
} from './lib/repositories/tags';

export {
  listAccounts,
  listAccountsWithUsage,
  createAccount,
  updateAccount,
  getAccountByName,
  deleteAccount,
  type AccountWithUsage,
} from './lib/repositories/accounts';

export {
  listBanks,
  listBanksWithUsage,
  createBank,
  updateBank,
  getBankByName,
  deleteBank,
  type BankWithUsage,
} from './lib/repositories/banks';

export {
  listRecipientMethods,
  createRecipientMethod,
  updateRecipientMethod,
  deleteRecipientMethod,
} from './lib/repositories/recipient-methods';

export {
  listPayments,
  listActivePayments,
  getPayment,
  getPaymentRow,
  createPayment,
  updatePayment,
  deletePayment,
  setPaymentFlag,
  addPaymentTags,
  setPaymentAccount,
  setPaymentBudget,
  setPaymentMethod,
  setPaymentTags,
  deletePaymentFrom,
  splitPaymentForward,
  type PaymentWithMeta,
  type PaymentMetaLookups,
  type PaymentInput,
  type DeletePaymentResult,
} from './lib/repositories/payments';

export {
  getBoardBundle,
  type BoardBundle,
  type PaymentWithTags,
} from './lib/repositories/board-bundle';

export {
  listAttachments,
  addAttachment,
  deleteAttachment,
  reconcileAttachments,
  type AttachmentInput,
} from './lib/repositories/attachments';

export {
  listPaymentEvents,
  markOccurrence,
  setOccurrenceOverride,
  mergeOccurrenceOverride,
  setOccurrenceFlag,
  clearOccurrence,
  type PaymentOverrides,
} from './lib/repositories/payment-events';

export { getRates } from './lib/repositories/rates';

export {
  listBudgets,
  getBudgetsBundle,
  createBudget,
  updateBudget,
  setBudgetClosed,
  deleteBudget,
  materializeRecurringBudgets,
  resolveBudgetForDate,
  type BudgetInput,
  type BudgetExpense,
  type BudgetExpenseAttachment,
  type BudgetExpenseTag,
  type BudgetWithExpenses,
} from './lib/repositories/budgets';

export {
  createExpense,
  updateExpense,
  getExpense,
  deleteExpense,
  listExpenses,
  addExpenseTags,
  setExpenseAccount,
  setExpenseBudget,
  setExpenseTags,
  type ExpenseInput,
  type ExpenseWithMeta,
  type ExpenseLine,
  type ExpenseLineAttachment,
  type ExpenseLineTag,
} from './lib/repositories/expenses';

export {
  addExpenseAttachment,
  deleteExpenseAttachment,
  reconcileExpenseAttachments,
  type ExpenseAttachmentInput,
} from './lib/repositories/expense-attachments';

export {
  createStatementImport,
  finalizeStatementImport,
  latestStatementImport,
  listStatementImports,
  insertImportedTransactions,
  insertSyncedTransactions,
  listPendingBankTransactions,
  getBankTransactionsByIds,
  updateBankTransactionEnrichment,
  markBankTransactionCategorized,
  markBankTransactionIgnored,
  markBankTransactionsIgnored,
  backfillTransactionsBank,
  listBankConnections,
  getBankConnectionById,
  getConnectionByBank,
  getConnectionByAuthState,
  upsertPendingConnection,
  activateConnection,
  setConnectionStatus,
  setConnectionBank,
  setConnectionBankIfUnset,
  setConnectionIgnorePatterns,
  markConnectionSynced,
  listSyncableConnections,
  deleteBankConnection,
  replaceBankAccounts,
  listBankAccounts,
  markBankAccountSynced,
  type ImportedTransactionInput,
  type InsertedTransactions,
  type BankTransactionEnrichment,
  type PendingConnectionInput,
  type BankAccountInput,
} from './lib/repositories/bank-sync';

export {
  listAutomations,
  listEnabledAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  setAutomationEnabled,
  deleteAutomation,
  reorderAutomations,
  touchAutomationRun,
  type AutomationInput,
} from './lib/repositories/automations';

export {
  createNotification,
  createNotifications,
  listNotifications,
  listNotificationsPage,
  countUnreadNotifications,
  markNotificationsRead,
  type NotificationInput,
  type NotificationCursor,
  type NotificationsPage,
} from './lib/repositories/notifications';

export type {
  Automation,
  NewAutomation,
  Notification,
  NewNotification,
} from './lib/schema/automations';

export {
  getInsightsLayout,
  setInsightsLayout,
} from './lib/repositories/insights-layout';
export type { InsightsLayout, InsightsLayoutData } from './lib/schema/insights';

export {
  listDashboardCharts,
  createDashboardChart,
  seedDashboardCharts,
  updateDashboardChart,
  deleteDashboardChart,
  reorderDashboardCharts,
  type NewChartInput,
} from './lib/repositories/dashboard-charts';
export type {
  DashboardChart,
  NewDashboardChart,
  DashboardChartKind,
  DashboardChartConfig,
  ChartGroupBy,
  ChartDisplay,
  SpendFilterConfig,
  StatMeasure,
} from './lib/schema/insights';
