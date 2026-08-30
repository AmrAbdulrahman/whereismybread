/**
 * Minimal fetch stub for unit tests. Maps URL substrings to JSON responses.
 * Restore with the returned function.
 */
export function stubFetch(routes: Record<string, unknown>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = Object.keys(routes).find((key) => url.includes(key));
    if (!match) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(routes[match]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
