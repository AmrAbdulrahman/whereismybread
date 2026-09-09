'use client';

import { useEffect } from 'react';
import { BreadSlice } from '../icons/brand';
import { SLOGAN } from './wordmark';

/**
 * The boot splash — brand purple, shown before the app has hydrated so a cold
 * (or installed-PWA) launch never flashes a bare page. It is server-rendered as
 * the first child of `<body>`; `<SplashAutoHide>` fades it out on hydration and
 * `SPLASH_HIDE_SCRIPT` is the no-JS / slow-hydration fallback.
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
color:#fff;opacity:1;transition:opacity .32s ease}
#${SPLASH_ELEMENT_ID}.wib-splash-hide{opacity:0;pointer-events:none}
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
 * Fallback: hide the splash on `load` even if React never hydrates, and hard
 * cap it so a broken bundle can't trap the user behind it.
 */
export const SPLASH_HIDE_SCRIPT = `(function(){var id=${JSON.stringify(
  SPLASH_ELEMENT_ID,
)};function h(){var e=document.getElementById(id);if(e)e.classList.add('wib-splash-hide');}
window.addEventListener('load',function(){setTimeout(h,150)});setTimeout(h,4000);})();`;

export function SplashScreen() {
  return (
    <div id={SPLASH_ELEMENT_ID} aria-hidden="true">
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

/** Fades the splash out once the app is interactive, then removes it. */
export function SplashAutoHide() {
  useEffect(() => {
    const el = document.getElementById(SPLASH_ELEMENT_ID);
    if (!el) return;
    const raf = requestAnimationFrame(() => el.classList.add('wib-splash-hide'));
    const done = () => el.remove();
    el.addEventListener('transitionend', done, { once: true });
    const fallback = setTimeout(done, 800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      el.removeEventListener('transitionend', done);
    };
  }, []);
  return null;
}
