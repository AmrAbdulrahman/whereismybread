#!/usr/bin/env node
/**
 * Regenerate the iOS PWA launch images in `apps/web/public/splash/`.
 *
 * These are the static screens iOS paints while an installed PWA boots, before
 * the webview has loaded and the in-app <SplashScreen> takes over. They now
 * mirror that component 1:1 — brand-purple gradient, bread mark, the
 * "Where Is My / Bread" lockup, the slogan, and the loader bar — so the handoff
 * from native launch image to live splash is seamless (the bar just starts
 * animating). Keep this design in sync with `SPLASH_CSS` in
 * `libs/ui/src/components/splash.tsx`.
 *
 * One `<basename>_portrait.png` + `<basename>_landscape.png` per device family.
 * The device table below is the source of truth; `APPLE_SPLASH` in
 * `apps/web/src/app/layout.tsx` must list the same basenames + metrics so the
 * `<link rel="apple-touch-startup-image">` media queries resolve.
 *
 * Text is rendered with the vendored brand fonts in `design/brand/fonts/`
 * (Fredoka + IBM Plex Sans, both OFL) via a scoped fontconfig, so the output is
 * reproducible on any machine with `rsvg-convert` (librsvg) on PATH.
 *
 *   node scripts/gen-splash-assets.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/public/splash');
const FONTS = join(ROOT, 'design/brand/fonts');
const MASTER = join(ROOT, 'design/brand/bread.png');
const BREAD_URI = `data:image/png;base64,${readFileSync(MASTER).toString('base64')}`;

/**
 * `[basename, cssWidth, cssHeight, dpr]` — iOS's natural (portrait) device
 * metrics. Mirror of `APPLE_SPLASH` in `apps/web/src/app/layout.tsx`.
 */
const DEVICES = [
  ['iPhone_17_Pro_Max__iPhone_16_Pro_Max', 440, 956, 3],
  ['iPhone_17_Pro__iPhone_17__iPhone_16_Pro', 402, 874, 3],
  ['iPhone_Air', 420, 912, 3],
  ['iPhone_16_Plus__iPhone_15_Pro_Max__iPhone_15_Plus__iPhone_14_Pro_Max', 430, 932, 3],
  ['iPhone_16__iPhone_15_Pro__iPhone_15__iPhone_14_Pro', 393, 852, 3],
  ['iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max', 428, 926, 3],
  ['iPhone_17e__iPhone_16e__iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12', 390, 844, 3],
  ['iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X', 375, 812, 3],
  ['iPhone_11_Pro_Max__iPhone_XS_Max', 414, 896, 3],
  ['iPhone_11__iPhone_XR', 414, 896, 2],
  ['iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus', 414, 736, 3],
  ['iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE', 375, 667, 2],
  ['4__iPhone_SE__iPod_touch_5th_generation_and_later', 320, 568, 2],
  ['13__iPad_Pro_M4', 1032, 1376, 2],
  ['12.9__iPad_Pro', 1024, 1366, 2],
  ['11__iPad_Pro_M4', 834, 1210, 2],
  ['11__iPad_Pro__10.5__iPad_Pro', 834, 1194, 2],
  ['10.9__iPad_Air', 820, 1180, 2],
  ['10.5__iPad_Air', 834, 1112, 2],
  ['10.2__iPad', 810, 1080, 2],
  ['9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad', 768, 1024, 2],
  ['8.3__iPad_Mini', 744, 1133, 2],
];

// Scoped fontconfig so the vendored brand fonts resolve without touching the
// user's font setup. librsvg reads FONTCONFIG_FILE.
const FC_CACHE = join(tmpdir(), 'wib-splash-fc-cache');
const FC_FILE = join(tmpdir(), 'wib-splash-fonts.conf');
mkdirSync(FC_CACHE, { recursive: true });
writeFileSync(
  FC_FILE,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS}</dir>
  <cachedir>${FC_CACHE}</cachedir>
  <include ignore_missing="yes">/usr/local/etc/fonts/fonts.conf</include>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
</fontconfig>`,
);

/**
 * The splash artwork as an SVG, sized in CSS px. Content is centred both axes,
 * matching `<SplashScreen>` (`display:flex;align-items:center;justify-content:
 * center;gap:22px`). Metrics below are the `SPLASH_CSS` values verbatim.
 */
function svg(w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const MARK = 96; // <BreadSlice size={96} />
  const GAP = 22;
  // Stack, top-anchored at `top`, then shifted up by half its height to centre.
  // Heights: mark 96 · "Where Is My" ~16 · "Bread" ~34 · slogan ~13 · bar 4.
  const stackH = MARK + GAP + 16 + 4 + 34 + GAP + 13 + GAP + 4;
  let y = cy - stackH / 2;

  const markY = y;
  y += MARK + GAP;
  const line1Y = y + 13; // text baseline for ~16px cap
  y += 16 + 4;
  const wordY = y + 27; // baseline for ~34px cap
  y += 34 + GAP;
  const tagY = y + 10; // baseline for ~13px cap
  y += 13 + GAP;
  const barY = y;

  const BAR_W = 132;
  const SEG_W = BAR_W * 0.4; // the 40%-wide runner in SPLASH_CSS

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c53ff"/>
      <stop offset="0.6" stop-color="#6b3dff"/>
      <stop offset="1" stop-color="#5a2fe0"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <image x="${cx - MARK / 2}" y="${markY}" width="${MARK}" height="${MARK}" href="${BREAD_URI}"/>
  <text x="${cx}" y="${line1Y}" text-anchor="middle" fill="#ffffff" fill-opacity="0.92"
    font-family="Fredoka" font-weight="500" font-size="16" letter-spacing="-0.16">Where Is My</text>
  <text x="${cx}" y="${wordY}" text-anchor="middle" fill="#ffffff"
    font-family="Fredoka" font-weight="700" font-size="34" letter-spacing="-0.34">Bread</text>
  <text x="${cx}" y="${tagY}" text-anchor="middle" fill="#ffffff" fill-opacity="0.75"
    font-family="IBM Plex Sans" font-size="13">Same bread, smarter finances.</text>
  <rect x="${cx - BAR_W / 2}" y="${barY}" width="${BAR_W}" height="4" rx="2" fill="#ffffff" fill-opacity="0.22"/>
  <rect x="${cx - BAR_W / 2}" y="${barY}" width="${SEG_W}" height="4" rx="2" fill="#ffffff"/>
</svg>`;
}

function render(base, cssW, cssH, dpr, landscape) {
  const w = landscape ? cssH : cssW;
  const h = landscape ? cssW : cssH;
  const tmp = join(tmpdir(), `wib-splash-${base}-${landscape ? 'l' : 'p'}.svg`);
  const out = join(OUT, `${base}_${landscape ? 'landscape' : 'portrait'}.png`);
  writeFileSync(tmp, svg(w, h));
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(
    'rsvg-convert',
    ['-w', String(w * dpr), '-h', String(h * dpr), '-o', out, tmp],
    { env: { ...process.env, FONTCONFIG_FILE: FC_FILE } },
  );
  rmSync(tmp);
  console.log(`  ${out.replace(ROOT + '/', '')}  (${w * dpr}×${h * dpr})`);
}

console.log('ios pwa launch images:');
for (const [base, cssW, cssH, dpr] of DEVICES) {
  render(base, cssW, cssH, dpr, false);
  render(base, cssW, cssH, dpr, true);
}
rmSync(FC_FILE, { force: true });
rmSync(FC_CACHE, { recursive: true, force: true });
console.log(`done. ${DEVICES.length * 2} files. keep DEVICES in sync with APPLE_SPLASH in apps/web/src/app/layout.tsx.`);
