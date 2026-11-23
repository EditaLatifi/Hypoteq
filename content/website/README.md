# Website content (design «Look 06», HYPOTEQ 20.11.2026)

The public website under `/{de,fr,it,en}/…` is a port of HYPOTEQ's design package
`HYPOTEQ_Website_Entwicklung_2026-11-20.zip` (folder `quelle/`, generator `build.py`). The pages
render the generator's markup 1:1, so the design's stylesheet and script apply unchanged.

| Here | From the package |
|---|---|
| `content/website/pages/*.json` | `quelle/_content/pages/*.json` (one file per page, keys de/fr/it/en) |
| `content/website/keywords.json`, `keywords-leads.json`, `cantons.json` | `quelle/_content/` |
| `content/website/strings.json` | the fixed texts of `quelle/build.py` and `_src/extend.py` (navigation, UI, calculator, cantons), dumped with `scripts/website/dump-strings.py` |
| `content/website/image-sources.json` | `quelle/_src/assets/img/sources.json` (Unsplash sources) |
| `styles/website.css` | `quelle/_src/assets/style.css`, font URLs pointing to `/site/fonts/` |
| `public/site/app.js`, `public/site/fonts/`, `public/site/img/` | `quelle/_src/assets/` |
| `lib/website/site.ts`, `lib/website/render.ts` | the generator (`build.py`, `extend.py`) in TypeScript |

## A new package from HYPOTEQ

1. Copy the files above over the current ones (`pages/index.ts` lists the page files: add a line
   for a new page).
2. `python -I scripts/website/dump-strings.py <package>/quelle/build.py content/website/strings.json`
3. If `build.py` itself changed beyond its texts (a new section type, changed markup), port that
   change to `lib/website/render.ts`.
4. Check: `npx next dev -p 3005`, then
   `node scripts/website/compare.mjs http://localhost:3005 <package>/website out.json`
   compares every page's body, JSON-LD, title, description, canonical and hreflang with the
   package's HTML (a language code as fifth argument limits it to one language).

## Differences to the package

- Links are paths on this site (`/de/hypotheken`), assets come from `/site/`.
- Funnel and portal are this site's own: `/{lang}/funnel`, `/portal/login`.
- Canonical, hreflang, sitemap and JSON-LD use `SITE_CONFIG.url` (`lib/seo.ts`); the package
  uses `https://hypoteq.com` (domain decision still open).
- The forms (contact, partner, newsletter) are still the package's demo forms and send nothing;
  the preview bar and the footer note say so.
