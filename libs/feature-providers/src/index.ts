// Reusable service providers — a name + icon + website + a default tag set,
// referenced by payments, expenses, bank transactions and automations.
// Server queries live in @wib/feature-providers/server.

export {
  saveProviderAction,
  deleteProviderAction,
  listProvidersAction,
  providerPickerDataAction,
  fetchProviderBrandingAction,
  type ProviderRow,
  type ProviderMark,
} from './lib/actions';
export {
  providerFormSchema,
  optionalProviderUrl,
  type ProviderFormValues,
} from './lib/schema';
export { ProviderManager } from './components/provider-manager';
export { ProviderPicker } from './components/provider-picker';
export { ProviderForm } from './components/provider-form';
