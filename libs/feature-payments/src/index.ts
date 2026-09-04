// Client-safe surface. Server queries live in @wib/feature-payments/server.

export { PaymentsView } from './components/payments-view';
export { PaymentForm, type PaymentFormProps } from './components/payment-form';
export { BankManager } from './components/bank-manager';
export { ChecklistView } from './components/checklist-view';
export { BudgetsView } from './components/budgets-view';

export {
  savePaymentAction,
  createMethodAction,
  createRecipientMethodAction,
  createAccountAction,
  createBankAction,
  saveAccountAction,
  deleteAccountAction,
  listAccountsAction,
  saveBankAction,
  deleteBankAction,
  listBanksAction,
  deletePaymentAction,
  loadListWindowAction,
  markOccurrenceAction,
  clearOccurrenceAction,
  resetOccurrenceAction,
  flagPaymentAction,
  setMonthIncomeAction,
  resetMonthIncomeAction,
  uploadAttachmentAction,
  removeAttachmentAction,
  discardBlobsAction,
  type LabelRow,
  type BankMark,
  type EditScope,
  type ScopeInput,
} from './lib/actions';

export {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  attachmentKind,
  formatBytes,
  resolveAttachmentType,
  type AttachmentKind,
} from './lib/attachments';

export { paymentFormSchema, type PaymentFormValues } from './lib/schema';
export { methodFormSchema, type MethodFormValues } from './lib/method-schema';
export {
  recipientMethodFormSchema,
  type RecipientMethodFormValues,
} from './lib/recipient-method-schema';
export {
  accountFormSchema,
  type AccountFormValues,
} from './lib/account-schema';
export { bankFormSchema, type BankFormValues } from './lib/bank-schema';
export type {
  PaymentBoard,
  BoardOccurrence,
  DayGroup,
  EditablePayment,
  OccurrenceAccount,
  OccurrenceAttachment,
  OccurrenceBank,
  OccurrenceRecipientMethod,
  AttachmentDraft,
  BudgetExpenseView,
  BudgetSummary,
  ExpenseLine,
} from './lib/types';

export {
  saveBudgetAction,
  deleteBudgetAction,
  saveExpenseAction,
  deleteExpenseAction,
  uploadExpenseAttachmentAction,
  removeExpenseAttachmentAction,
} from './lib/budget-actions';

export { budgetFormSchema, type BudgetFormValues } from './lib/budget-schema';
export { expenseFormSchema, type ExpenseFormValues } from './lib/expense-schema';
