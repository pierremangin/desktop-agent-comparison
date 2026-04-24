# Desktop AI Agents Apps Comparison

#### Comparative table of a curated selection of desktop ai agentic apps

There's a new breed of applications that bring the power of llm-based coding agents and agentic ai to the non technical knowledge workers' desktop.
The market is huge.
Claude Cowork is leading the way.
Goose has been around for a while.
New appls are poping up every week since the beginning of 2026.
This page showcases a curated list of these apps.

Rendered as a transposed matrix (criteria as rows, tools as columns). Bilingual UI (French / English), more languages planned.

Pure front-end: no build step, no package manager, no tests. `index.html` loads the `@supabase/supabase-js` UMD bundle from jsDelivr and `app.js` renders the table from a Supabase Postgres backend.

## Stack

- Static HTML + vanilla JS
- Supabase (Postgres + PostgREST + RLS with public-read policies)
- Apache shared hosting (OVHcloud), served directly from the repo

## Running locally

Serve over HTTP (`file://` breaks the Supabase fetch in some browsers):

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Data model

Six tables in Supabase:

- `languages` — language codes and labels.
- `categories`, `licenses`, `update_frequencies` — small lookups with a `labels jsonb` column (`{"fr":"…","en":"…"}`).
- `tools` — one row per app. Flat: typed columns for platforms (macOS / Windows / Linux / iOS / Android) and features (model choice, freemium, enterprise offer, local LLM, local / cloud agentic, documentation, automation). Booleans are tri-state — `null` means "unknown" and renders as an em-dash.
- `tools_translations` — EAV table for long localized text (description, positioning, ideal_for, limitations, editor_notes).

Row-Level Security is enabled on all tables with public-read policies, which is what lets the anon key work in the browser.

## Front-end architecture

- `CRITERIA` array in `app.js` is the single source of truth for row order, labels (FR + EN), and per-cell render logic.
- `UI` object holds all localized UI strings.
- `fetchTools()` pulls everything in one PostgREST query using embedded selects; language and filter changes never re-fetch, they just re-render.
- Category filter buttons are rendered from the `categories` table — no hardcoded category strings.

## Deploy

The repo **is** the deploy artifact. OVH pulls `main` directly into the webroot on every push. Anything committed at the repo root ends up publicly served.

- `.gitignore` is the primary boundary — dev artifacts (`schema.sql`, ops templates, notes) are kept out of the repo entirely.
- `.htaccess` is defense-in-depth — it blocks `/.git/*` and denies Markdown / SQL / env / dotfiles at the HTTP layer.

## Secrets

Only the Supabase URL + **publishable (anon)** key are embedded in `app.js`. That's expected for an anon key paired with RLS public-read policies. No service-role key belongs here.
