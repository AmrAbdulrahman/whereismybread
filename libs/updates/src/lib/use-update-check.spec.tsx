import { renderHook, waitFor } from '@testing-library/react';
import { stubFetch } from '@wmm/testing';
import { useUpdateCheck } from './use-update-check';

describe('useUpdateCheck', () => {
  it('checks /api/version and records the result', async () => {
    const restore = stubFetch({
      '/api/version': {
        buildId: 'deadbeef',
        commit: 'deadbeef',
        builtAt: '2026-01-01T00:00:00Z',
      },
    });
    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => expect(result.current.lastChecked).not.toBeNull());
    expect(result.current.latest?.buildId).toBe('deadbeef');
    // CURRENT_BUILD_ID is "dev" in tests, so no nag.
    expect(result.current.updateAvailable).toBe(false);

    restore();
  });
});
