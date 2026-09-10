// Client-safe surface: view components + 'use server' actions. Node-only
// queries are in `@wib/feature-debts/server`.

export { DebtsView } from './components/debts-view';
export { DebtDetail } from './components/debt-detail';
export { SharedDebtView } from './components/shared-debt-view';
export { DebtOtpForm } from './components/debt-otp-form';

export {
  savePersonAction,
  saveDebtAction,
  deleteDebtAction,
  settleDebtAction,
  recordRepaymentAction,
  deleteRepaymentAction,
  resendPersonLinkAction,
} from './lib/actions';
export {
  requestDebtOtpAction,
  verifyDebtOtpAction,
} from './lib/share-actions';

export type {
  DebtsData,
  DebtView,
  DebtDetail as DebtDetailData,
  DebtEntryView,
  PersonView,
  SharedView,
} from './lib/types';
