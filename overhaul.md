# Fully Automated Monitoring System Overhaul

**Last updated:** 2026-05-06  
**Context:** Architecture redesign for desktop agent comparison tool monitoring pipeline. Scope: 13 tools, ~30 fields per tool, daily updates, rapid validation → production launch in 4 weeks.

---

## Executive Summary

Replace the current "service_role key on Mac + launchd" approach with a **secure, auditable, append-only server-side pipeline**:

- **GitHub Actions** → deterministic collection + LLM extraction
- **Supabase Edge Functions** → policy-driven auto-approval + atomic apply
- **Append-only tables** → full audit trail for every change
- **Field-level metadata** → flexible, configurable auto-apply rules
- **Stability gates** → two-run or two-source confirmation before publishing
- **Zero secrets on laptops** → all credentials in GitHub Secrets

**Key improvements:**
1. **Auto-approve threshold:** confidence > 0.85 automatically applies changes
2. **Fixed parameter:** mark converged fields to skip monitoring
3. **Stability validation:** run daily until all fields stabilize, then launch

---

## Target Architecture

### Core Principle

Supabase is the system of record for **published values**, but every update is the output of a controlled server-side pipeline:

- **Append-only** — every proposal is logged immutably
- **Auditable** — full trace from raw data → decision → published change
- **Policy-gated** — auto-approval rules are explicit, configurable, enforceable
- **Least-privilege** — no service_role keys outside the server runtime

---

## Data Model

### New Tables

#### `field_definitions`
Metadata for each monitored field. Defines auto-apply policy, confidence thresholds, stability requirements.

```sql
CREATE TABLE field_definitions (
  field_key TEXT PRIMARY KEY,
  label JSONB,  -- {"en": "Version", "fr": "Version", ...}
  description TEXT,
  type TEXT,  -- boolean, text, date, enum
  enum_values TEXT[],  -- if type = enum
  volatility TEXT,  -- stable, monthly, weekly, daily
  
  auto_apply_allowed BOOLEAN DEFAULT false,
  confidence_threshold FLOAT DEFAULT 0.85,
  two_source_required BOOLEAN DEFAULT false,
  two_run_required BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### `tool_field_metadata`
Per-tool, per-field tracking. Convergence detection, lock status, change history.

```sql
CREATE TABLE tool_field_metadata (
  tool_id UUID FK,
  field_key TEXT FK field_definitions,
  
  is_fixed BOOLEAN DEFAULT false,
  fixed_at TIMESTAMPTZ,
  confidence_when_fixed FLOAT,
  
  last_approved_value TEXT,
  last_changed_at TIMESTAMPTZ,
  change_count INT DEFAULT 0,
  
  PRIMARY KEY (tool_id, field_key)
);
```

#### `snapshots` (append-only)
Raw fetched content from authoritative sources. Enables audit trail + reprocessing.

```sql
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID FK tools,
  source_type TEXT,  -- 'github', 'vendor_site', 'web', 'package_manager'
  source_url TEXT,
  
  fetched_at TIMESTAMPTZ,
  http_status INT,
  content_hash TEXT,  -- for deduplication
  content_excerpt TEXT,  -- first 2KB for audit
  etag TEXT,  -- for conditional GET next run
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `observations` (append-only)
Normalized proposals extracted from snapshots. Typed, sourced, confidence-scored.

```sql
CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID FK,
  field_key TEXT FK field_definitions,
  
  proposed_value TEXT,  -- typed per field_definitions.type
  confidence FLOAT,  -- 0.0 to 1.0
  
  source_url TEXT,
  source_quote TEXT,  -- proof snippet from snapshot
  snapshot_id UUID FK snapshots,
  extractor_version TEXT,  -- track prompt/parser version
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `decisions` (append-only)
Policy engine output. Why an observation was auto-approved, rejected, or escalated.

```sql
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id UUID FK,
  tool_id UUID FK,
  field_key TEXT,
  
  decision TEXT,  -- 'auto_applied', 'rejected', 'needs_review'
  reason TEXT,  -- policy explanation
  
  policy_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `audit_tools_changes` (append-only)
Immutable log of every write to the `tools` table.

```sql
CREATE TABLE audit_tools_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID FK,
  field_key TEXT,
  
  old_value TEXT,
  new_value TEXT,
  
  decision_id UUID FK decisions,
  run_id UUID FK,  -- which agent run triggered this
  applied_by TEXT,  -- 'auto-policy', 'user@email'
  applied_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `tool_runs`
Summary of each automation run. Observability + debugging.

```sql
CREATE TABLE tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  tools_checked INT,
  snapshots_fetched INT,
  observations_produced INT,
  decisions_made INT,
  
  auto_applied INT,
  rejected INT,
  needs_review INT,
  
  errors JSONB,
  status TEXT,  -- 'success', 'partial', 'failed'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Key Improvements

### 1. Auto-Approve Threshold (Confidence > 0.85)

**Policy:** Observations with confidence ≥ 0.85 are automatically applied without human review (if `field_definitions.auto_apply_allowed = true`).

**Implementation:**
```typescript
// In Supabase Edge Function (triggered on observation INSERT)
if (observation.confidence >= fieldDef.confidence_threshold &&
    fieldDef.auto_apply_allowed) {
  
  await applyObservation(observation)
  await recordDecision({
    decision: 'auto_applied',
    reason: `Confidence ${observation.confidence} > threshold ${fieldDef.confidence_threshold}`
  })
}
```

**Benefits:**
- Eliminates manual review bottleneck for high-confidence updates
- Speeds validation phase (daily runs converge faster)
- Reduces human workload in production

### 2. Fixed Parameter

**Purpose:** Mark converged fields to skip monitoring in future runs.

**Definition:** A field is "fixed" when:
- No approved changes in 10+ consecutive days, AND
- Confidence of last approved change ≥ 0.90

**Implementation:**
```sql
-- Mark field as fixed after convergence
UPDATE tool_field_metadata
SET is_fixed = true, 
    fixed_at = NOW(),
    confidence_when_fixed = (
      SELECT confidence FROM observations 
      WHERE tool_id = $1 AND field_key = $2
      ORDER BY created_at DESC LIMIT 1
    )
WHERE tool_id = $1 AND field_key = $2;
```

**Agent behavior:**
```python
# Skip monitoring for fixed fields
if field_metadata.is_fixed:
  continue  # Don't fetch, don't extract, don't observe

# Otherwise, run normally
snapshot = fetch(source)
observation = extract(snapshot)
```

**Benefits:**
- Reduces API calls (Tavily, GitHub, etc.) in production
- Cleaner tool_watches (fewer false alarms)
- Signals which data is "validated for now"

### 3. Stability Validation (Two-Run or Two-Source Confirmation)

**Gates prevent flip-flopping** before publishing:

**Option A (Two-Run):**
```
Run 1: observe version = 2.5.0 (confidence 0.92)
       → write to decisions: needs_review (same value not yet confirmed)
Run 2: observe version = 2.5.0 (confidence 0.93)
       → decision: auto_applied (two consecutive runs agree)
```

**Option B (Two-Source):**
```
Source 1 (GitHub): version = 2.5.0 (confidence 0.95)
Source 2 (Vendor): version = 2.5.0 (confidence 0.88)
       → decision: auto_applied (two independent sources agree)
```

**Configuration in field_definitions:**
```sql
INSERT INTO field_definitions (field_key, two_run_required, two_source_required, ...)
VALUES ('version', true, false, ...);
```

**Edge Function logic:**
```typescript
if (fieldDef.two_run_required) {
  // Check if same value was proposed in last 24h from a different run
  const prevObservation = await db.from('observations')
    .select('*')
    .eq('tool_id', obs.tool_id)
    .eq('field_key', obs.field_key)
    .eq('proposed_value', obs.proposed_value)
    .gt('created_at', NOW() - INTERVAL '24 hours')
    .gt('created_at', obs.created_at)  // from a prior run
    .single()
  
  if (prevObservation) {
    await applyObservation(obs)
  } else {
    await recordDecision({ decision: 'needs_review', reason: 'awaiting two-run confirmation' })
  }
}
```

---

## Automation Pipeline

### Stage 1: Collection (GitHub Actions, Daily 7 AM)

**Trigger:** `schedule: cron: '0 7 * * *'`

**Steps:**
1. For each tool, fetch from authoritative sources (in parallel):
   - GitHub API (version, license, topics, platforms)
   - Package managers (npm/pypi/homebrew if applicable)
   - Vendor pricing pages (Tavily extraction)
2. Hash content; skip re-extraction if unchanged
3. Store in `snapshots`

### Stage 2: Extraction

**For each snapshot:**

1. **Deterministic extraction first** (no cost, no hallucination):
   - Parse GitHub structured data (SPDX license in package.json, etc.)
   - Extract release tags, commit dates
   - Parse README for structured claims (platforms, requirements)

2. **LLM extraction for unstructured content:**
   ```python
   # Call Claude with field schema
   extraction = client.messages.create(
     model="claude-opus-4-7",
     messages=[{
       role: "user",
       content: f"""
   Extract tool features from this content.
   
   Fields to extract (return JSON):
   - version: string (semver)
   - license: enum from {SPDX_LICENSE_CODES}
   - supports_macos: boolean
   - open_source: boolean
   
   Content:
   {snapshot.content_excerpt}
   
   IMPORTANT: Return only valid JSON. Include 'confidence' (0.0-1.0) for each field.
       """
     }]
   )
   ```

3. **Always attach proof:**
   ```python
   observation = {
     'tool_id': tool_id,
     'field_key': 'version',
     'proposed_value': '2.5.0',
     'confidence': 0.96,
     'source_url': snapshot.source_url,
     'source_quote': '"Release v2.5.0 (May 2025)"',  # ← proof from snapshot
     'snapshot_id': snapshot.id,
     'extractor_version': 'claude-opus-4-7_v1.2'  # ← track for regression detection
   }
   ```

4. **Store in `observations`** (append-only)

### Stage 3: Policy Decision (Supabase Edge Function)

**Triggered on observation INSERT:**

```typescript
export default async (req: Request) => {
  const observation = await req.json()
  const fieldDef = await getFieldDefinition(observation.field_key)
  const toolField = await getToolFieldMetadata(observation.tool_id, observation.field_key)

  // Gate 1: Is this field eligible for auto-apply?
  if (!fieldDef.auto_apply_allowed) {
    recordDecision('needs_review', 'field not auto-appliable')
    return
  }

  // Gate 2: Is this field locked?
  if (toolField.is_fixed) {
    recordDecision('rejected', 'field is fixed/locked')
    return
  }

  // Gate 3: Confidence threshold?
  if (observation.confidence < fieldDef.confidence_threshold) {
    recordDecision('needs_review', `confidence ${observation.confidence} < ${fieldDef.confidence_threshold}`)
    return
  }

  // Gate 4: Two-run confirmation?
  if (fieldDef.two_run_required) {
    const prevObservation = await findPreviousObservation(observation.tool_id, observation.field_key, observation.proposed_value)
    if (!prevObservation) {
      recordDecision('needs_review', 'awaiting two-run confirmation')
      return
    }
  }

  // All gates passed — apply
  await applyObservation(observation)
  recordDecision('auto_applied', 'all policy gates passed')
}
```

### Stage 4: Apply to Tools (SECURITY DEFINER Function)

**Called only for approved observations:**

```sql
CREATE FUNCTION apply_observation(
  p_observation_id UUID,
  p_applied_by TEXT
) RETURNS void AS $$
DECLARE
  v_obs RECORD;
  v_old_value TEXT;
BEGIN
  SELECT * INTO v_obs FROM observations WHERE id = p_observation_id;
  
  -- Get current value for audit trail
  SELECT (t -> v_obs.field_key)::TEXT INTO v_old_value
  FROM tools t WHERE t.id = v_obs.tool_id;
  
  -- Update tools table (only this function can write)
  UPDATE tools
  SET (v_obs.field_key) = (v_obs.proposed_value)
  WHERE id = v_obs.tool_id;
  
  -- Log to audit trail
  INSERT INTO audit_tools_changes (
    tool_id, field_key, old_value, new_value, 
    observation_id, applied_by, applied_at
  ) VALUES (
    v_obs.tool_id, v_obs.field_key, v_old_value, v_obs.proposed_value,
    p_observation_id, p_applied_by, NOW()
  );
  
  -- Update field metadata (last changed timestamp, change count)
  UPDATE tool_field_metadata
  SET last_approved_value = v_obs.proposed_value,
      last_changed_at = NOW(),
      change_count = change_count + 1
  WHERE tool_id = v_obs.tool_id AND field_key = v_obs.field_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Stage 5: Translation (Async, On Content Change)

**When English description/positioning changes:**

```typescript
// Edge Function triggered by audit_tools_changes
if (['description', 'positioning', 'ideal_for', 'limitations'].includes(change.field_key)) {
  const englishValue = change.new_value
  
  // Call Claude to translate
  const translations = await claude.messages.create({
    model: 'claude-opus-4-7',
    messages: [{
      role: 'user',
      content: `Translate to: FR, ES, DE, IT, NL, RU, HI, PT, JA, KO, ZH\n\n${englishValue}`
    }]
  })
  
  // Insert all 11 translations at once
  const rows = parseTranslations(translations.content, change.tool_id, change.field_key)
  await db.from('tools_translations').insert(rows)
  
  // Log to audit trail
  await db.from('audit_tools_changes').insert({
    action: 'translate',
    field_key: change.field_key,
    applied_by: 'claude',
    metadata: { languages: 11 }
  })
}
```

---

## Roadmap: Validation → Launch

### Week 1: Setup & First Runs

**Goals:** Establish daily collection, extract initial data, identify unstable fields.

- [ ] Add `field_definitions` table, populate with all 13 tools × ~30 fields
- [ ] Add `snapshots`, `observations`, `decisions` tables
- [ ] Create GitHub Actions workflow (daily at 7 AM)
- [ ] Implement Stage 2 (LLM extraction) in `orchestrate.py`
- [ ] Implement Stage 3 (policy decision) Edge Function
- [ ] Set confidence_threshold = 0.85 for all fields
- [ ] Set two_run_required = true for volatile fields (version, release_date, features)
- [ ] Run daily; observe `tool_runs` for errors, coverage, observation counts

**Success metrics:**
- All 13 tools fetch successfully (http 200)
- Observations written for ≥ 80% of fields
- No crashes or timeouts

### Week 2: Convergence

**Goals:** Let data settle; identify which fields are stable.

- [ ] Continue daily runs (same config)
- [ ] Build **stability dashboard** (SQL query):
  ```sql
  SELECT 
    tool_id, field_key,
    COUNT(DISTINCT proposed_value) as unique_values,
    MAX(confidence) as max_conf,
    MAX(created_at) as latest_obs,
    (NOW() - MAX(created_at))::INT as hours_since_last_change
  FROM observations
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY tool_id, field_key
  ORDER BY unique_values DESC, hours_since_last_change ASC;
  ```
- [ ] Manually mark fields as "fixed" once no changes for 5+ runs:
  ```sql
  UPDATE tool_field_metadata
  SET is_fixed = true, fixed_at = NOW()
  WHERE tool_id = $1 AND field_key = $2
    AND (NOW() - last_changed_at) > INTERVAL '5 days';
  ```

**Success metrics:**
- ≥ 90% of fields show 0 changes in last 3 runs
- At least 5 fields per tool marked "fixed"

### Week 3: Stability Validation

**Goals:** Confirm two-run gates work; verify no flip-flops.

- [ ] Continue daily runs
- [ ] Monitor `decisions` table: how many "awaiting two-run confirmation" vs "auto_applied"?
- [ ] Check for flip-flops: field changes value, then changes back (bad)
  ```sql
  SELECT tool_id, field_key, COUNT(*) as changes_in_7d
  FROM audit_tools_changes
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY tool_id, field_key
  HAVING COUNT(*) > 3;  -- suspicious
  ```
- [ ] Refine extraction prompts for unstable fields
- [ ] Update `field_definitions.confidence_threshold` if needed (e.g., raise to 0.90 for tricky fields)

**Success metrics:**
- Zero flip-flops detected
- ≥ 95% of fields marked "fixed"
- Remaining volatile fields stable for 3+ consecutive days

### Week 4: Launch Prep

**Goals:** Final validation; deploy to production.

- [ ] Manual spot-check: 10 random field values against authoritative source
- [ ] Review all auto-applied changes in `audit_tools_changes` (none should be obviously wrong)
- [ ] Verify translations are correct (spot-check 5 tools × 3 languages)
- [ ] Test revert procedure: if a bad auto-apply slips through, can you fix it?
- [ ] Document runbook: how to approve pending changes, how to lock a field, how to revert

**Launch checklist:**
- [ ] All 13 tools have ≥ 10 validated observations each
- [ ] ≥ 95% of fields marked "fixed"
- [ ] Zero rejected observations due to policy gates
- [ ] audit_tools_changes shows > 50 auto-applied changes (proof it's working)
- [ ] No crashes or errors in last 7 runs
- [ ] Emergency revert procedure tested and documented

**Go live:** Push to main, deploy to OVH.

---

## Pragmatic Approach: Start Simple, Evolve

**This roadmap assumes a hybrid implementation:**

- **Weeks 1-2:** Use my simpler proposal (GitHub Actions + Edge Functions + tool_watches)
  - Faster to implement (days, not weeks)
  - Less schema complexity
  - Sufficient for validation phase

- **Week 2-3:** Migrate to the full model:
  - Add `field_definitions` (configurable policy)
  - Add `snapshots` + `observations` (structured audit trail)
  - Add `decisions` (explicit reasoning)
  - Implement two-run gates

- **After launch:** Graduate further:
  - Separate DB roles + SECURITY DEFINER (higher security bar)
  - Job queue with row-level locking (if scaling to 100+ tools)
  - Deterministic collectors per source (if cost becomes a concern)

**Why this order:** Ship fast, validate data quality, *then* harden the infrastructure.

---

## Security Posture

### No Service-Role Keys on Laptops

- **GitHub Secrets** hold all API keys (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.)
- Agent runs entirely in GitHub Actions sandbox
- Service-role key never touches a local machine

### Audit Trail is Mandatory

- Every write to `tools` goes through `apply_observation()` (SECURITY DEFINER)
- Every change is logged to `audit_tools_changes` with timestamp, actor, reason
- Immutable append-only tables prevent deletion of history

### Confidence + Policy Gates

- Blind auto-apply is prevented; every change must pass explicit policy checks
- `field_definitions` specifies which fields can auto-apply
- Confidence threshold, two-run gate, two-source gate are all configurable per field

---

## Observability & Alerting

### Dashboards

**Daily run summary:**
```sql
SELECT 
  t.run_date::DATE,
  COUNT(DISTINCT t.tool_id) as tools_checked,
  SUM(t.snapshots_fetched) as snapshots,
  SUM(t.observations_produced) as observations,
  SUM(t.auto_applied) as auto_applied,
  SUM(t.needs_review) as pending_review,
  SUM(t.errors_count) as errors
FROM tool_runs t
WHERE t.run_date > NOW() - INTERVAL '30 days'
GROUP BY t.run_date
ORDER BY t.run_date DESC;
```

**Pending review queue:**
```sql
SELECT tool_id, field_key, COUNT(*) as pending
FROM decisions
WHERE decision = 'needs_review'
GROUP BY tool_id, field_key
ORDER BY pending DESC;
```

**Volatile fields (changing frequently):**
```sql
SELECT 
  obs.field_key,
  COUNT(DISTINCT obs.tool_id) as tools_affected,
  COUNT(*) as observation_count
FROM observations obs
WHERE obs.created_at > NOW() - INTERVAL '7 days'
GROUP BY obs.field_key
ORDER BY observation_count DESC;
```

### Alerts (If Manual Intervention Needed)

- **High error rate:** > 3 failed runs in a row → check logs, disable problematic collector
- **Flip-flop detected:** same field changes value 3+ times in 24h → lock field, review extractor
- **Pending review backlog:** > 20 observations awaiting approval → batch review session
- **Snapshot fetch failures:** > 5 HTTP 4xx/5xx in single run → source may be down, try fallback

---

## Migration from Current System

**Current:**
- `tool_watches` (append-only proposals)
- Manual SQL apply to `tools`
- launchd on Mac

**New:**
- `observations` (append-only proposals, typed + sourced)
- `decisions` (policy evaluation)
- Automatic apply via Edge Function

**Migration path:**
```sql
-- Copy existing approved tool_watches into observations
INSERT INTO observations (
  tool_id, field_key, proposed_value, confidence, 
  source_url, snapshot_id, created_at
)
SELECT 
  tool_id, field_key, proposed_value, 0.85,  -- assume threshold confidence
  'legacy-import', NULL, created_at
FROM tool_watches
WHERE approved = true;

-- Decommission launchd on Mac
launchctl unload ~/Library/LaunchAgents/com.comparatif.agent.plist
rm ~/Library/LaunchAgents/com.comparatif.agent.plist
```

---

## Next Steps

1. **Prioritize:** Which approach appeals more—start with simpler proposal (2 weeks) or full proposal (6 weeks)?
2. **Design:** Detail the GitHub Actions workflow and LLM extraction prompt
3. **Schema:** Create SQL migrations for new tables
4. **Implementation:** Begin Week 1 tasks

