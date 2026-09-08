import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface Branding {
  name?: string;
  color?: string;
  /** Logo as a `data:` URI, ready to drop into an <img src>. */
  logoUrl?: string;
}

const HTML_BYTE_CAP = 512 * 1024;
const IMAGE_BYTE_CAP = 150 * 1024;
const FETCH_TIMEOUT_MS = 6000;
const UA =
  'Mozilla/5.0 (compatible; WhereIsMyBread/1.0; +https://github.com/wib)';

/** RFC1918 / loopback / link-local / CGNAT / unspecified — never fetch these. */
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224 // multicast / reserved
    );
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (
    lower.startsWith('fe80') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  )
    return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIp(mapped[1]);
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('That address is not reachable.');
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname))
      throw new Error('That address is not reachable.');
    return;
  }
  const records = await lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) throw new Error('Could not resolve that site.');
  if (records.some((r) => isPrivateIp(r.address))) {
    throw new Error('That address is not reachable.');
  }
}

/** Accepts a bare domain or a full URL; returns a validated https/http URL. */
export function normalizeSiteUrl(raw: string): URL {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http(s) links are supported.');
  }
  return url;
}

async function safeFetch(url: URL, byteCap: number): Promise<Response> {
  await assertPublicHost(url.hostname);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: '*/*' },
  });
  const len = Number(res.headers.get('content-length') ?? '0');
  if (len > byteCap) throw new Error('Response too large.');
  return res;
}

async function readCapped(res: Response, byteCap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > byteCap) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  const hex6 = v.match(/^#([0-9a-f]{6})$/);
  if (hex6) return `#${hex6[1]}`;
  const hex3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (hex3)
    return `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`;
  const rgb = v.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if (rgb) {
    const [, r, g, b] = rgb;
    const hex = [r, g, b]
      .map((n) =>
        Math.max(0, Math.min(255, Number(n)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
    return `#${hex}`;
  }
  return undefined;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(
    new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

function pickIconHref(html: string, base: URL): string | undefined {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  type Cand = { href: string; score: number };
  const cands: Cand[] = [];
  for (const tag of links) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    if (!rel.includes('icon')) continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    const sizes = attr(tag, 'sizes') ?? '';
    const size = Number(sizes.split('x')[0]) || 0;
    let score = size;
    if (rel.includes('apple-touch-icon')) score += 200;
    if (/\.svg(\?|$)/i.test(href)) score += 150;
    if (/\.png(\?|$)/i.test(href)) score += 50;
    cands.push({ href, score });
  }
  const og = html.match(
    /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i,
  )?.[0];
  const ogHref = og ? attr(og, 'content') : undefined;
  if (ogHref) cands.push({ href: ogHref, score: 40 });

  cands.sort((a, b) => b.score - a.score);
  const best = cands[0]?.href;
  try {
    return best
      ? new URL(best, base).toString()
      : new URL('/favicon.ico', base).toString();
  } catch {
    return undefined;
  }
}

function pickName(html: string): string | undefined {
  const site = html.match(
    /<meta\b[^>]*property\s*=\s*["']og:site_name["'][^>]*>/i,
  )?.[0];
  const fromOg = site ? attr(site, 'content') : undefined;
  const fromTitle = html
    .match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
    ?.split(/[|–—-]/)[0];
  const name = (fromOg ?? fromTitle ?? '').replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, 60) : undefined;
}

function pickColor(html: string): string | undefined {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const themed: string[] = [];
  for (const tag of metas) {
    const name = (attr(tag, 'name') ?? '').toLowerCase();
    const content = attr(tag, 'content');
    if (!content) continue;
    if (name === 'theme-color') {
      const media = attr(tag, 'media');
      if (media && /dark/i.test(media)) continue; // prefer the light one
      themed.unshift(content);
    } else if (name === 'msapplication-tilecolor') {
      themed.push(content);
    }
  }
  for (const c of themed) {
    const norm = normalizeColor(c);
    // Skip near-white / near-black — useless as a brand accent.
    if (norm && !/^#(f{6}|fefefe|0{6}|010101)$/.test(norm)) return norm;
  }
  return undefined;
}

/** Fetch a site's HTML + best icon and distil name / brand colour / logo. */
export async function fetchBranding(rawUrl: string): Promise<Branding> {
  const site = normalizeSiteUrl(rawUrl);

  const htmlRes = await safeFetch(site, HTML_BYTE_CAP);
  const html = new TextDecoder().decode(
    await readCapped(htmlRes, HTML_BYTE_CAP),
  );

  const result: Branding = {};
  result.name = pickName(html);
  result.color = pickColor(html);

  const iconUrl = pickIconHref(html, new URL(htmlRes.url || site.toString()));
  if (iconUrl) {
    try {
      const iconRes = await safeFetch(new URL(iconUrl), IMAGE_BYTE_CAP);
      const type =
        (iconRes.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
      const bytes = await readCapped(iconRes, IMAGE_BYTE_CAP);
      if (
        bytes.length > 0 &&
        bytes.length <= IMAGE_BYTE_CAP &&
        (type.startsWith('image/') || iconUrl.endsWith('.ico'))
      ) {
        const mime =
          type && type.startsWith('image/')
            ? type
            : iconUrl.endsWith('.svg')
              ? 'image/svg+xml'
              : 'image/x-icon';
        const b64 = Buffer.from(bytes).toString('base64');
        result.logoUrl = `data:${mime};base64,${b64}`;
      }
    } catch {
      // logo is best-effort
    }
  }

  return result;
}
