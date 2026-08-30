import {
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';

export interface RenderWithProvidersOptions extends Omit<
  RenderOptions,
  'wrapper'
> {
  /** Wrap the tree in app-level providers (Toast, Query, ...) supplied by the caller. */
  wrapper?: (props: { children: ReactNode }) => ReactElement;
}

/**
 * Renders a component and returns a bound `user` event instance. Feature tests
 * pass their own `wrapper` (with ToastProvider / QueryClientProvider) so this
 * lib stays a pure utility.
 */
export function renderWithProviders(
  ui: ReactElement,
  { wrapper, ...options }: RenderWithProvidersOptions = {},
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const result = render(ui, { wrapper, ...options });
  return { ...result, user };
}

export * from '@testing-library/react';
export { userEvent };
