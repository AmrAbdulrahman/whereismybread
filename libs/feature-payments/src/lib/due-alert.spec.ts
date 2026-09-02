import { describe, expect, it } from 'vitest';
import { dueAlertFor } from './due-alert';
import type { BoardOccurrence } from './types';

const TODAY = '2026-09-10';

function occ(
  over: Partial<Pick<BoardOccurrence, 'dueDate' | 'status' | 'method'>>,
): Pick<BoardOccurrence, 'dueDate' | 'status' | 'method'> {
  return { dueDate: TODAY, status: 'scheduled', method: null, ...over };
}

const cash = {
  id: 'm',
  name: 'Cash',
  kind: 'cash' as const,
  iconKey: 'cash',
  logoUrl: null,
  color: '#000',
};
const directDebit = { ...cash, kind: 'direct_debit' as const, name: 'DD' };

describe('dueAlertFor', () => {
  it('flags an overdue unpaid manual payment', () => {
    expect(dueAlertFor(occ({ dueDate: '2026-09-08' }), TODAY)?.level).toBe(
      'overdue',
    );
  });

  it('flags a manual payment due today', () => {
    expect(dueAlertFor(occ({ dueDate: TODAY }), TODAY)?.level).toBe('today');
  });

  it('flags a manual payment due within two days', () => {
    expect(dueAlertFor(occ({ dueDate: '2026-09-11' }), TODAY)?.level).toBe(
      'soon',
    );
    expect(dueAlertFor(occ({ dueDate: '2026-09-12' }), TODAY)?.level).toBe(
      'soon',
    );
  });

  it('stays quiet three or more days out', () => {
    expect(dueAlertFor(occ({ dueDate: '2026-09-13' }), TODAY)).toBeNull();
  });

  it('stays quiet once paid or skipped', () => {
    expect(
      dueAlertFor(occ({ dueDate: '2026-09-01', status: 'paid' }), TODAY),
    ).toBeNull();
    expect(
      dueAlertFor(occ({ dueDate: '2026-09-01', status: 'skipped' }), TODAY),
    ).toBeNull();
  });

  it('stays quiet for auto-collected methods', () => {
    expect(
      dueAlertFor(occ({ dueDate: '2026-09-01', method: directDebit }), TODAY),
    ).toBeNull();
  });

  it('treats cash and no-method as manual', () => {
    expect(
      dueAlertFor(occ({ dueDate: TODAY, method: cash }), TODAY)?.level,
    ).toBe('today');
    expect(
      dueAlertFor(occ({ dueDate: TODAY, method: null }), TODAY)?.level,
    ).toBe('today');
  });
});
