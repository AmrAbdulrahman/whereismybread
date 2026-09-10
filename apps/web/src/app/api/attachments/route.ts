import { get } from '@vercel/blob';
import { hashToken, requireUserId } from '@wib/auth/server';
import { findLiveDebtGrant, getDebtAttachmentGrantInfo } from '@wib/db';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** Every kind of attachment this route is allowed to stream, by blob prefix. */
const ATTACHMENT_KINDS = ['payments', 'expenses', 'debts'];

/**
 * `true` when this request carries a valid `wib_debt` grant for the person the
 * debt behind `path` is with — lets the OTP-verified other party view debt /
 * repayment attachments without an app account.
 */
async function allowedByDebtGrant(path: string): Promise<boolean> {
  if (!path.startsWith('debts/')) return false;
  const raw = (await cookies()).get('wib_debt')?.value;
  if (!raw) return false;
  const grant = await findLiveDebtGrant(hashToken(raw));
  if (!grant) return false;
  const info = await getDebtAttachmentGrantInfo(path);
  return (
    !!info &&
    info.personId === grant.personId &&
    path.startsWith(`debts/${info.ownerId}/`)
  );
}

/**
 * Streams a payment / expense / debt attachment. The blob store is private, so
 * files can't be linked to directly — this route authenticates the viewer
 * (the owning user, or an OTP-granted debt viewer) and checks the blob
 * pathname before proxying the bytes.
 */
export async function GET(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!path || path.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  let userId: string | null = null;
  try {
    userId = await requireUserId();
  } catch {
    userId = null;
  }

  const ownedByUser =
    userId != null &&
    ATTACHMENT_KINDS.some((kind) => path.startsWith(`${kind}/${userId}/`));

  if (!ownedByUser && !(await allowedByDebtGrant(path))) {
    return new Response(userId ? 'Not found' : 'Unauthorized', {
      status: userId ? 404 : 401,
    });
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
