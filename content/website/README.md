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
- Canonical, hreflang, sitemap and JSON-LD use `SITE_CONFIG.url` (`lib/seo.ts`):
  `https://hypoteq.com`, the live domain (hypoteq.ch redirects there). Home URLs are `/de`, not
  `/de/` (Next.js redirects `/de/` to `/de`).
- `lib/website/overrides.ts` changes three pages on top of the package: Impressum and
  Datenschutz carry the live site's texts (messages/{lang}.json «impressum»,
  components/Impressium.tsx) instead of the package's drafts; the Dokumente PDF cards download
  the PDFs in public/documents. `compare.mjs` skips these pages. The footer's company column
  links the AGB (`/{lang}/agb`) as the live site's footer does.
- The forms send: contact → `/api/contact`, partner → `/api/partner-contact`, footer
  newsletter → `/api/newsletter` (`public/site/forms.js`, texts in `forms.json`, error style in
  `styles/website-extra.css`). The preview bar and the footer's preview note are gone.
- Share images per language in `public/site/og` (the package has none), in the look of its
  LinkedIn banner.
- `scripts/website/audit.mjs <server> out.json` checks SEO and content on every page.
