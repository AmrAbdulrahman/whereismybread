'use client';

import { useEffect, useState } from 'react';
import { BreadSlice } from '../icons/brand';
import { SLOGAN } from './wordmark';

/**
 * The boot splash — brand purple, shown before the app has hydrated so a cold
 * (or installed-PWA) launch never flashes a bare page.
 *
 * It is rendered by React (SSR'd, so it paints immediately) and then hidden
 * with CSS once hydrated — the node is never unmounted or removed. An earlier
 * version called `el.remove()` from an effect; that corrupts React's view of
 * `<body>` and blows up the next reconcile with "removeChild ... not a child of
 * this node" (it surfaced as a hard crash on `/insights`). Leave the DOM alone.
 *
 * Always purple in both themes — it matches the brand sheet and the native
 * PWA splash (manifest `background_color`).
 */
export const SPLASH_ELEMENT_ID = 'wib-splash';

/** Critical CSS — inline this in `<head>` so the splash paints immediately. */
export const SPLASH_CSS = `
#${SPLASH_ELEMENT_ID}{position:fixed;inset:0;z-index:2147483647;display:flex;
flex-direction:column;align-items:center;justify-content:center;gap:22px;
background:#6b3dff;background:linear-gradient(180deg,#7c53ff 0%,#6b3dff 60%,#5a2fe0 100%);
color:#fff;opacity:1;transition:opacity .3s ease}
#${SPLASH_ELEMENT_ID}[data-hiding]{opacity:0;pointer-events:none;visibility:hidden;
transition:opacity .3s ease,visibility 0s linear .3s}
#${SPLASH_ELEMENT_ID} .wib-splash-word{display:flex;flex-direction:column;align-items:center;
font-family:var(--font-fredoka),'Fredoka',ui-sans-serif,system-ui,sans-serif;
line-height:1;letter-spacing:-.01em}
#${SPLASH_ELEMENT_ID} .wib-splash-word b{font-weight:700;font-size:34px}
#${SPLASH_ELEMENT_ID} .wib-splash-word span{font-weight:500;font-size:16px;opacity:.92}
#${SPLASH_ELEMENT_ID} .wib-splash-tag{font-size:13px;color:rgba(255,255,255,.75);
font-family:var(--font-plex-sans),'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif}
#${SPLASH_ELEMENT_ID} .wib-splash-bar{width:132px;height:4px;border-radius:999px;
background:rgba(255,255,255,.22);overflow:hidden}
#${SPLASH_ELEMENT_ID} .wib-splash-bar i{display:block;width:40%;height:100%;border-radius:999px;
background:#fff;animation:wib-splash-slide 1.1s ease-in-out infinite}
@keyframes wib-splash-slide{0%{transform:translateX(-120%)}100%{transform:translateX(330%)}}
@media (prefers-reduced-motion:reduce){
#${SPLASH_ELEMENT_ID}{transition:none}
#${SPLASH_ELEMENT_ID} .wib-splash-bar i{animation:none;width:100%}}
`.trim();

/**
 * Fallback for a bundle that never hydrates: fade the splash on `load` so it
 * can't trap the user. Only ever adds an attribute (CSS-driven fade) — it never
 * removes the node, so it can't race React. Inline this in `<head>`.
 */
export const SPLASH_HIDE_SCRIPT = `(function(){var id=${JSON.stringify(
  SPLASH_ELEMENT_ID,
)};function h(){var e=document.getElementById(id);if(e)e.setAttribute('data-hiding','');}
window.addEventListener('load',function(){setTimeout(h,4000)});})();`;

/**
 * Renders the splash and fades it out (CSS only) once hydrated. The node stays
 * mounted — `[data-hiding]` makes it `opacity:0; visibility:hidden;
 * pointer-events:none`, i.e. fully inert. Put it as the first child of `<body>`
 * in the root layout.
 */
export function SplashScreen() {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHiding(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      id={SPLASH_ELEMENT_ID}
      aria-hidden="true"
      {...(hiding ? { 'data-hiding': '' } : {})}
    >
      <BreadSlice size={96} />
      <span className="wib-splash-word">
        <span>Where Is My</span>
        <b>Bread</b>
      </span>
      <span className="wib-splash-tag">{SLOGAN}</span>
      <span className="wib-splash-bar">
        <i />
      </span>
    </div>
  );
}
