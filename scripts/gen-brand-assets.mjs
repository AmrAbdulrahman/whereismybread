#!/usr/bin/env node
/**
 * Regenerate every rasterised brand asset from the master bread logo
 * (`design/brand/bread.png` — a transparent PNG, used as-is, no redraw):
 *   - apps/web/public/brand/bread.png                    (in-app <img> logo, 384px)
 *   - apps/web/src/app/icon.png                          (favicon, App Router convention)
 *   - apps/web/public/favicon-16..64.png + favicon.ico   (legacy favicons)
 *   - apps/web/public/icon-192.png, icon-512.png         (PWA, "any" — bread on purple)
 *   - apps/web/public/icon-maskable-512.png              (PWA, "maskable")
 *   - apps/web/public/apple-touch-icon.png               (iOS home screen)
 *
 * The iOS PWA launch images in apps/web/public/splash/ are a separate curated
 * set (device-named, both orientations) — not touched here. Their device table
 * + media queries live in apps/web/src/app/layout.tsx (APPLE_SPLASH).
 *
 * Needs `rsvg-convert` (librsvg) and `sips` (macOS) on PATH.
 *
 *   node scripts/gen-brand-assets.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'apps/web/public');
const APP = join(ROOT, 'apps/web/src/app');
const MASTER = join(ROOT, 'design/brand/bread.png');

const PURPLE = '#6b3dff';
const DATA_URI = `data:image/png;base64,${readFileSync(MASTER).toString('base64')}`;

/** Resize the master straight to a PNG (transparent, no compositing). */
function resize(outPath, px) {
  mkdirSync(dirname(outPath), { recursive: true });
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(px), String(px), MASTER, '--out', outPath], {
    stdio: 'ignore',
  });
  console.log(`  ${outPath.replace(ROOT + '/', '')}  (${px}²)`);
}

/** Composite the logo onto a (optionally rounded) purple tile via rsvg. */
function tile(outPath, px, { radius = 0, scale }) {
  const inset = ((1 - scale) / 2) * px;
  const size = scale * px;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
<rect width="${px}" height="${px}"${radius ? ` rx="${radius}" ry="${radius}"` : ''} fill="${PURPLE}"/>
<image x="${inset}" y="${inset}" width="${size}" height="${size}" href="${DATA_URI}"/>
</svg>`;
  const tmp = join(PUBLIC, `.${px}.tmp.svg`);
  writeFileSync(tmp, svg);
  mkdirSync(dirname(outPath), { recursive: true });
  execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', outPath, tmp]);
  rmSync(tmp);
  console.log(`  ${outPath.replace(ROOT + '/', '')}  (${px}²)`);
}

/** Pack PNG frames into a PNG-payload .ico (widely supported, IE11+). */
function writeIco(pngPaths, outPath) {
  const frames = pngPaths.map((p) => ({
    size: Number(p.match(/-(\d+)\.png$/)[1]),
    data: readFileSync(p),
  }));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + dir.length;
  frames.forEach((f, i) => {
    const e = i * 16;
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, e);
    dir.writeUInt8(f.size >= 256 ? 0 : f.size, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(f.data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += f.data.length;
  });
  writeFileSync(outPath, Buffer.concat([head, dir, ...frames.map((f) => f.data)]));
  console.log(`  ${outPath.replace(ROOT + '/', '')}  (${frames.map((f) => f.size).join('/')})`);
}

console.log('logo + favicons:');
resize(join(PUBLIC, 'brand/bread.png'), 384);
resize(join(APP, 'icon.png'), 512);
const faviconPngs = [16, 32, 48, 64].map((px) => {
  const p = join(PUBLIC, `favicon-${px}.png`);
  resize(p, px);
  return p;
});
writeIco(faviconPngs.slice(0, 3), join(PUBLIC, 'favicon.ico'));

console.log('app icons (bread on purple):');
tile(join(PUBLIC, 'icon-192.png'), 192, { radius: 42, scale: 0.82 });
tile(join(PUBLIC, 'icon-512.png'), 512, { radius: 112, scale: 0.82 });
tile(join(PUBLIC, 'icon-maskable-512.png'), 512, { radius: 0, scale: 0.66 });
tile(join(PUBLIC, 'apple-touch-icon.png'), 180, { radius: 0, scale: 0.86 });

console.log('done. (public/splash/* is the curated set — not generated here)');
