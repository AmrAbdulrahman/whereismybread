import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InlineAssignChip,
  InlineTagChip,
  budgetAssignOptions,
} from './inline-assign-chip';
import type { BudgetSummary } from '../lib/types';

const budget = (over: Partial<BudgetSummary>): BudgetSummary => ({
  id: 'b1',
  name: 'Groceries',
  period: 'month',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  color: '#5d1fce',
  recurring: true,
  closedAt: null,
  limit: { minorUnits: 30000, currency: 'GBP' },
  spentMinor: 0,
  remainingMinor: 30000,
  progress: 0,
  expenses: [],
  ...over,
});

describe('budgetAssignOptions', () => {
  it('keeps the most recent instance per name and drops closed budgets', () => {
    const opts = budgetAssignOptions([
      budget({ id: 'aug', name: 'Groceries', startDate: '2026-08-01' }),
      budget({ id: 'sep', name: 'Groceries', startDate: '2026-09-01' }),
      budget({ id: 'old', name: 'Holiday', closedAt: '2026-01-01T00:00:00Z' }),
      budget({ id: 'car', name: 'Car', startDate: '2026-09-01' }),
    ]);
    expect(opts.map((o) => o.id)).toEqual(['car', 'sep']);
  });
});

describe('InlineAssignChip', () => {
  it('renders nothing when there are no options', () => {
    const { container } = render(
      <InlineAssignChip label="budget" options={[]} onPick={() => undefined} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('opens the menu and reports the picked id', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <InlineAssignChip
        label="account"
        options={[
          { id: 'a1', name: 'Joint', color: '#111' },
          { id: 'a2', name: 'Personal', color: '#222' },
        ]}
        onPick={onPick}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    await user.click(screen.getByRole('option', { name: 'Personal' }));
    expect(onPick).toHaveBeenCalledWith('a2');
  });
});

describe('InlineTagChip', () => {
  it('opens a tag editor and reports the new tag list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InlineTagChip
        value={['work']}
        suggestions={[{ name: 'personal', color: '#111' }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'personal' }));
    expect(onChange).toHaveBeenCalledWith(['work', 'personal']);
  });
});
