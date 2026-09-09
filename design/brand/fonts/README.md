# Brand fonts (build-time only)

Used by `scripts/gen-splash-assets.mjs` to render text into the iOS PWA launch
images. Not shipped to the browser — the web app loads Fredoka / IBM Plex Sans
via `next/font/google`.

| File | Source | Notes |
| --- | --- | --- |
| `Fredoka-Medium.ttf` | Google Fonts `ofl/fredoka` variable font, pinned to `wght=500, wdth=100` | matches `.wib-splash-word span` |
| `Fredoka-Bold.ttf` | same, pinned to `wght=700, wdth=100` | matches `.wib-splash-word b` |
| `IBMPlexSans-Regular.ttf` | Fontsource `ibm-plex-sans` latin 400 | matches `.wib-splash-tag` |

All three are SIL Open Font License 1.1 — see `OFL-Fredoka.txt` and
`OFL-IBMPlexSans.txt`.
