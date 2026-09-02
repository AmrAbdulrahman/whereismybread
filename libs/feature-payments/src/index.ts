// Client-safe surface. Server queries live in @wib/feature-payments/server.

export { PaymentsView } from './components/payments-view';
export { PaymentForm, type PaymentFormProps } from './components/payment-form';

export {
  savePaymentAction,
  createMethodAction,
  createRecipientMethodAction,
  createAccountAction,
  createBankAction,
  deletePaymentAction,
  loadListWindowAction,
  markOccurrenceAction,
  clearOccurrenceAction,
  resetOccurrenceAction,
  setMonthIncomeAction,
  resetMonthIncomeAction,
  type EditScope,
  type ScopeInput,
} from './lib/actions';

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
  OccurrenceBank,
  OccurrenceRecipientMethod,
} from './lib/types';
