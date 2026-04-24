-- =============================================================
-- Comparateur Outils IA Bureau — Schema v2 (flat + lookups + JSONB labels)
-- Run in Supabase SQL Editor, or via `supabase db push`.
--
-- OPTION 1: Start fresh. The DROP block below is ENABLED.
-- All v1 data will be lost.
-- =============================================================


-- -------------------------------------------------------------
-- 0. Drop the v1 schema
-- -------------------------------------------------------------
drop table if exists tools_translations       cascade;
drop table if exists tools_ux_pricing         cascade;
drop table if exists tools_governance         cascade;
drop table if exists tools_identity           cascade;
drop table if exists tools_capabilities       cascade;
drop table if exists tools_availability       cascade;
drop table if exists tools_ai_architecture    cascade;
drop table if exists tools                    cascade;
drop table if exists languages                cascade;


-- -------------------------------------------------------------
-- 1. Languages
-- -------------------------------------------------------------
create table languages (
  code  text primary key,
  label text not null
);

insert into languages (code, label) values
  ('fr', 'Français'),
  ('en', 'English');


-- -------------------------------------------------------------
-- 2. Categories
--    labels: {"fr":"Délégué IA","en":"AI Delegate"}
-- -------------------------------------------------------------
create table categories (
  id     smallserial primary key,
  code   text unique not null,
  labels jsonb not null
);

insert into categories (code, labels) values
  ('delegate',  '{"fr":"Délégué IA",   "en":"AI Delegate"}'::jsonb),
  ('teammate',  '{"fr":"Coéquipier IA","en":"AI Teammate"}'::jsonb),
  ('developer', '{"fr":"Développeur IA","en":"AI Developer"}'::jsonb);


-- -------------------------------------------------------------
-- 3. Licenses
-- -------------------------------------------------------------
create table licenses (
  id     smallserial primary key,
  code   text unique not null,
  labels jsonb not null
);

insert into licenses (code, labels) values
  ('proprietary', '{"fr":"Propriétaire","en":"Proprietary"}'::jsonb),
  ('open-source', '{"fr":"Open source","en":"Open source"}'::jsonb),
  ('mit',         '{"fr":"MIT","en":"MIT"}'::jsonb),
  ('apache-2',    '{"fr":"Apache 2.0","en":"Apache 2.0"}'::jsonb),
  ('gpl-3',       '{"fr":"GPL v3","en":"GPL v3"}'::jsonb);


-- -------------------------------------------------------------
-- 4. Update frequencies
-- -------------------------------------------------------------
create table update_frequencies (
  id     smallserial primary key,
  code   text unique not null,     -- 'weekly' | 'monthly' | 'yearly'
  labels jsonb not null
);

insert into update_frequencies (code, labels) values
  ('weekly',  '{"fr":"Hebdomadaire","en":"Weekly"}'::jsonb),
  ('monthly', '{"fr":"Mensuelle",   "en":"Monthly"}'::jsonb),
  ('yearly',  '{"fr":"Annuelle",    "en":"Yearly"}'::jsonb);


-- -------------------------------------------------------------
-- 5. Tools (one row per app)
-- -------------------------------------------------------------
create table tools (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  editor              text,
  website_url         text,

  category_id         smallint not null references categories(id),
  license_id          smallint references licenses(id),
  update_frequency_id smallint references update_frequencies(id),

  first_release_date  date,
  onboarding_level    smallint check (onboarding_level between 1 and 3),

  -- Platforms
  macos   bool,
  windows bool,
  linux   bool,
  ios     bool,
  android bool,

  -- Core features
  model_choice        bool,   -- Choix du modèle
  freemium            bool,
  enterprise_offer    bool,   -- Offre Entreprise
  local_llm           bool,
  local_agentic       bool,   -- Agentique Locale
  cloud_agentic_24_7  bool,   -- Agentique Cloud (24/7)
  documentation       bool,
  automation          bool,   -- Automatisation

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on tools (category_id);
create index on tools (license_id);
create index on tools (update_frequency_id);


-- -------------------------------------------------------------
-- 6. Long-text translations (EAV)
--    field_key examples: 'description', 'positioning', 'ideal_for',
--    'limitations', 'editor_notes'. Add any new key by inserting rows.
-- -------------------------------------------------------------
create table tools_translations (
  tool_id     uuid references tools(id) on delete cascade,
  lang_code   text references languages(code) on delete cascade,
  field_key   text not null,
  field_value text,
  primary key (tool_id, lang_code, field_key)
);


-- -------------------------------------------------------------
-- 7. Row-Level Security (public read for anon key)
-- -------------------------------------------------------------
alter table languages           enable row level security;
alter table categories          enable row level security;
alter table licenses            enable row level security;
alter table update_frequencies  enable row level security;
alter table tools               enable row level security;
alter table tools_translations  enable row level security;

create policy "public read" on languages          for select using (true);
create policy "public read" on categories         for select using (true);
create policy "public read" on licenses           for select using (true);
create policy "public read" on update_frequencies for select using (true);
create policy "public read" on tools              for select using (true);
create policy "public read" on tools_translations for select using (true);
