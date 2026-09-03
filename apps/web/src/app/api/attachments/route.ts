import { get } from '@vercel/blob';
import { requireUserId } from '@wib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * Streams a payment attachment back to its owner. The blob store is private, so
 * files can't be linked to directly — this route authenticates the viewer and
 * checks the blob pathname is under their own `payments/<userId>/` prefix
 * before proxying the bytes.
 */
export async function GET(request: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!path || !path.startsWith(`payments/${userId}/`) || path.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  let result;
  try {
    result = await get(path, { access: 'private' });
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!result || result.statusCode !== 200) {
    return new Response('Not found', { status: 404 });
  }

  const contentType =
    result.blob.contentType ||
    result.headers.get('content-type') ||
    'application/octet-stream';

  return new Response(result.stream, {
    headers: {
      'content-type': contentType,
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=300',
    },
  });
}
