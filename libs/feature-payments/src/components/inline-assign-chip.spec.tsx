import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('a click-away only closes the menu — it never reaches what was clicked', async () => {
    const user = userEvent.setup();
    const onOutside = vi.fn();
    const onOtherCard = vi.fn();
    render(
      <div onClick={onOutside}>
        <span data-testid="outside">elsewhere</span>
        {/* Stands in for another click-to-edit card in the list. */}
        <button type="button" data-testid="other-card" onClick={onOtherCard}>
          another card
        </button>
        <InlineAssignChip
          label="account"
          options={[{ id: 'a1', name: 'Joint', color: '#111' }]}
          onPick={() => undefined}
        />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();

    onOutside.mockClear();
    await user.click(screen.getByTestId('outside'));

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onOutside).not.toHaveBeenCalled();

    // Re-open, then click straight onto another card: it closes the menu and
    // that card's own handler never fires.
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
    await user.click(screen.getByTestId('other-card'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onOtherCard).not.toHaveBeenCalled();
  });

  it('closes on scroll', async () => {
    const user = userEvent.setup();
    render(
      <InlineAssignChip
        label="account"
        options={[{ id: 'a1', name: 'Joint', color: '#111' }]}
        onPick={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
    fireEvent.scroll(window);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows the current value as a filled pill and lets it be swapped', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <InlineAssignChip
        label="account"
        current={{ id: 'a1', name: 'Joint', color: '#111' }}
        options={[
          { id: 'a1', name: 'Joint', color: '#111' },
          { id: 'a2', name: 'Personal', color: '#222' },
        ]}
        onPick={onPick}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change account' }));
    // The already-selected option is inert.
    await user.click(screen.getByRole('option', { name: 'Joint' }));
    expect(onPick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Change account' }));
    await user.click(screen.getByRole('option', { name: 'Personal' }));
    expect(onPick).toHaveBeenCalledWith('a2');
  });

  it('offers a remove row only when onClear is given and a value is set', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <InlineAssignChip
        label="budget"
        current={{ id: 'b1', name: 'Groceries', color: '#111' }}
        options={[{ id: 'b1', name: 'Groceries', color: '#111' }]}
        onPick={() => undefined}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change budget' }));
    await user.click(screen.getByRole('button', { name: 'Remove budget' }));
    expect(onClear).toHaveBeenCalled();
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
    // With tags already present the trigger is a bare "+" ("Edit tags").
    await user.click(screen.getByRole('button', { name: 'Edit tags' }));
    await user.click(screen.getByRole('button', { name: 'personal' }));
    expect(onChange).toHaveBeenCalledWith(['work', 'personal']);
  });

  it('stays open when the list scrolls, so tags can be edited while browsing', async () => {
    const user = userEvent.setup();
    render(
      <InlineTagChip value={[]} suggestions={[]} onChange={() => undefined} />,
    );
    await user.click(screen.getByRole('button', { name: 'Add tags' }));
    expect(screen.queryByPlaceholderText(/Add tags/)).not.toBeNull();
    await act(async () => {
      fireEvent.scroll(window);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByPlaceholderText(/Add tags/)).not.toBeNull();
  });

  it('reads "+ tags" when the card has none', () => {
    render(
      <InlineTagChip value={[]} suggestions={[]} onChange={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Add tags' }).textContent).toBe(
      'tags',
    );
  });
});
