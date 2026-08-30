import { serverEnv } from '@wib/config';
import { Resend } from 'resend';

function client(): Resend {
  return new Resend(serverEnv().RESEND_API_KEY);
}

function layout(
  heading: string,
  body: string,
  button: { href: string; label: string },
): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1e24">
    <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#464d5a;margin:0 0 20px">${body}</p>
    <p style="margin:0 0 24px">
      <a href="${button.href}" style="display:inline-block;background:#4b57cf;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${button.label}</a>
    </p>
    <p style="font-size:13px;color:#767d8b;margin:0">Or paste this link into your browser:<br>${button.href}</p>
  </div>`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const { NODE_ENV, EMAIL_FROM } = serverEnv();
  if (NODE_ENV !== 'production') {
    // Sandbox sender only delivers to the Resend account owner, so surface the
    // link on the server for local testing regardless.
    const link = html.match(/href="([^"]+)"/)?.[1];
    console.info(`[auth email] to=${to} subject="${subject}" link=${link}`);
  }
  try {
    await client().emails.send({ from: EMAIL_FROM, to, subject, html });
  } catch (error) {
    console.error('[auth email] send failed', error);
  }
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<void> {
  const href = `${serverEnv().APP_URL}/reset-password/${token}`;
  await send(
    to,
    'Reset your password',
    layout(
      'Reset your password',
      'We got a request to reset your password. This link expires in 30 minutes. If it wasn’t you, ignore this email.',
      { href, label: 'Choose a new password' },
    ),
  );
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const href = `${serverEnv().APP_URL}/verify/${token}`;
  await send(
    to,
    'Confirm your email',
    layout(
      'Confirm your email address',
      'Tap below to confirm this is your email. The link expires in 24 hours.',
      { href, label: 'Confirm email' },
    ),
  );
}
