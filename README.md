# Desktop AI Agents Apps Comparison

#### Comparative table of a curated selection of desktop ai agentic apps

There's a new breed of applications that bring the power of llm-based coding agents and agentic ai to the non technical knowledge workers' desktop.
The market is huge.
Claude Cowork is leading the way.
Goose has been around for a while.
New appls are poping up every week since the beginning of 2026.
This page showcases a curated list of these apps.

Rendered as a transposed matrix (criteria as rows, tools as columns). **UI in 12 languages:** EN, FR, ES, DE, IT, NL, RU, HI, PT, JA, KO, ZH. Language switcher at top.

Pure front-end: no build step, no package manager, no tests. `index.html` loads the `@supabase/supabase-js` UMD bundle from jsDelivr and `app.js` renders the table from a Supabase Postgres backend. Includes expandable intro section (content fetched from Supabase), table with website links (Download column via inline SVG icon), and footer with ia-decoded.fr/com link.

## Stack

- Static HTML + vanilla JS
- Supabase (Postgres + PostgREST + RLS with public-read policies)
- Apache shared hosting (OVHcloud), served directly from the repo

## Local preview

Serve over HTTP, for example: `python3 -m http.server 8000`

## Data model

Five active tables in Supabase:

- `languages` — language codes and labels (12 languages).
- `licenses` — license types with multilingual labels (`{"fr":"…","en":"…",…}`).
- `tools` — one row per app. Flat schema: typed columns for platforms (macOS / Windows / Linux / iOS / Android), features (model choice, freemium, enterprise, local/cloud agentic, documentation, automation, open source, web interface, messaging, BYOK, MCP, computer use, etc.), and metadata (editor, location, website URL, release date, order, published flag). Booleans are tri-state — `null` means "unknown" and renders as an em-dash.
- `tools_translations` — EAV table for long localized text (description, positioning, ideal_for, limitations, editor_notes) in all 12 languages.
- `pages_content` — EAV table for multilingual content pages (currently intro section). Stores `page_key`, `section_key`, `lang_code`, `field_key`, and `field_value`. Add new content pages by inserting rows; no schema migration needed.

Row-Level Security is enabled on all tables with public-read policies, which is what lets the anon key work in the browser.

## Front-end architecture

**UI Layer:**
- `CRITERIA` array in `app.js` is the single source of truth for row order, labels (all 12 languages), and per-cell render logic. Includes platforms, features, website link (Download via inline SVG), and metadata.
- `UI` object holds all localized UI strings (title, criterion label, empty state, footer) in all 12 languages.
- `fetchTools()` pulls everything in one PostgREST query using embedded selects; language changes never re-fetch, they just re-render.
- Language switcher (12 buttons) at top — clicking a button updates `currentLang` and triggers a full re-render of the table labels, footer, and content.
- Inline SVG icons replace Font Awesome dependency (checkmark, cross, external link).
- `marked.js` is lazy-loaded only when the overlay is first opened, reducing initial page load time.

**Content Layer:**
- Intro section is expandable via "...plus" / "...moins" text toggle (not a button click).
- `fetchPagesContent()` pulls from `pages_content` table on init and caches in memory.
- `getPageContent(page, section, lang, field)` retrieves cached content.
- Supports multilingual content pages without modifying `app.js`.

## Deploy

The repo **is** the deploy artifact. OVH pulls `main` directly into the webroot on every push. Anything committed at the repo root ends up publicly served.

- `.gitignore` is the primary boundary — dev artifacts (all `.sql` files, CLAUDE.md, notes) are kept out of the repo entirely.
- `.htaccess` is defense-in-depth — it blocks `/.git/*` and denies Markdown / SQL / env / dotfiles at the HTTP layer.

## Secrets

Only the Supabase URL + **publishable (anon)** key are embedded in `app.js`. That's expected for an anon key paired with RLS public-read policies. No service-role key belongs here.
