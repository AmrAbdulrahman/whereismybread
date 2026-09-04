export { getDb, getSql, type Db } from './lib/client';
export { checkDatabase, type DbHealth } from './lib/health';
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

export {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserProfile,
  updateUserPreferences,
  updateUserPassword,
  markEmailVerified,
} from './lib/repositories/users';

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
  deleteBudget,
  materializeRecurringBudgets,
  type BudgetInput,
  type BudgetExpense,
  type BudgetExpenseAttachment,
  type BudgetWithExpenses,
} from './lib/repositories/budgets';

export {
  createExpense,
  updateExpense,
  getExpense,
  deleteExpense,
  listExpenses,
  type ExpenseInput,
  type ExpenseLine,
  type ExpenseLineAttachment,
} from './lib/repositories/expenses';

export {
  addExpenseAttachment,
  deleteExpenseAttachment,
  reconcileExpenseAttachments,
  type ExpenseAttachmentInput,
} from './lib/repositories/expense-attachments';
