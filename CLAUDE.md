# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A small static comparator for desktop "agentic AI" tools, rendered as a transposed table (criteria as rows, tools as columns). UI in French and English with more languages planned. Pure front-end — no build step, no package manager, no tests. `index.html` loads the `@supabase/supabase-js` UMD bundle from jsDelivr and `app.js` renders the table from a Supabase Postgres backend.

- `index.html` — inline styles, chrome (title + lang switcher + category filter), empty `<table id="tools-table">` skeleton, empty state element, overlay container.
- `app.js` — Supabase client, fetch, render, overlay. Hardcodes the Supabase URL + publishable (anon) key at the top.
- `schema.sql` — source of truth for the DB schema. Run in Supabase SQL Editor to recreate from scratch (it's destructive — drops v1 tables first).

## Running locally

Serve over HTTP (`file://` breaks the Supabase fetch in some browsers):

```
python3 -m http.server 8000
```

No install / build / lint / test commands.

## Supabase data model (v2, flat + lookups)

Six tables. The DDL in `schema.sql` is authoritative; this is the big picture.

```
languages (code PK, label)
categories          (id, code, labels jsonb)          -- labels: {"fr":"...","en":"..."}
licenses            (id, code, labels jsonb)
update_frequencies  (id, code, labels jsonb)          -- 'weekly' | 'monthly' | 'yearly'
tools               (id uuid, slug, name, editor, website_url,
                     category_id FK, license_id FK, update_frequency_id FK,
                     first_release_date, onboarding_level (1-3),
                     macos/windows/linux/ios/android bool,
                     model_choice, freemium, enterprise_offer,
                     local_llm, local_agentic, cloud_agentic_24_7,
                     documentation, automation bool)
tools_translations  (tool_id, lang_code, field_key, field_value)   -- EAV, composite PK
```

### Key invariants — easy to miss

- **Lookup labels live in a `labels jsonb` column** on the lookup row itself (`{"fr":"Délégué IA","en":"AI Delegate"}`). Access with `labels ->> 'fr'` in SQL or `labels[lang]` in JS. No side translation tables for these — intentional.
- **Long localized text uses EAV** in `tools_translations`. Adding a new `field_key` (e.g. `security_note`) means inserting rows, no migration. The front-end currently reads `description`, `positioning`, `ideal_for`, `limitations`, `editor_notes` in the overlay.
- **Feature matrix is typed columns, not JSONB.** Adding a new boolean feature is a deliberate `ALTER TABLE tools ADD COLUMN … bool`; then add a row to the `CRITERIA` array in `app.js`. Two places to update, on purpose.
- **Category filter is data-driven.** Buttons are rendered from the `categories` table; there are no hardcoded category strings in `index.html` anymore (the old `delegue`/`coequipier`/`developpeur` mismatch bug is fixed by construction).
- **RLS is on, with public-read policies** for all 6 tables. That's what makes the anon key work in the browser. If a service-role key ever appears in `app.js`, that's a bug.
- **Nullable booleans are intentional tri-state**: `true` → green check, `false` → red X, `null` → neutral em-dash (`—`). Render via `boolIcon()` in `app.js`; don't collapse `null` into `false`.

## Front-end architecture

Single `render()` call redraws everything from the in-memory `allTools` + `allCategories` arrays. Language and category-filter changes never re-fetch — they just re-render.

- `CRITERIA` array in `app.js` is the single source of truth for row order, row labels (FR + EN), and per-cell render logic. Add a feature → add a `CRITERIA` entry.
- `UI` object in `app.js` holds all UI strings (title, filter labels, overlay section titles) per language. Add a language → add a key to every object (plus a row in `languages` and a key in every `labels` jsonb).
- `fetchTools()` uses PostgREST embedding to pull `categories`, `licenses`, `update_frequencies`, and `tools_translations` in one request. Don't split it — the whole table renders from this one query.

## Secrets

Supabase URL + **publishable (anon)** key are embedded in `app.js`. That's expected for an anon key. Never commit a service-role key here.
