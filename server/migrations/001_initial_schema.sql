-- =============================================
--  migrations/001_initial_schema.sql
--  LeadFlow AI — Initial Database Schema
--  Run with: psql -U postgres -d leadflow_dev -f 001_initial_schema.sql
-- =============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── TENANTS ───────────────────────────────────
-- Represents one real estate agency (ready for multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200)  NOT NULL,
  slug        VARCHAR(100)  UNIQUE NOT NULL,
  plan        VARCHAR(50)   NOT NULL DEFAULT 'starter',
  settings    JSONB         NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── USERS ─────────────────────────────────────
-- Admins, managers, and executives all live here
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identity
  name                VARCHAR(200) NOT NULL,
  email               VARCHAR(300) NOT NULL,
  phone               VARCHAR(20),
  password_hash       TEXT NOT NULL,
  role                VARCHAR(50)  NOT NULL DEFAULT 'executive'
                        CHECK (role IN ('admin', 'manager', 'executive')),
  avatar_url          TEXT,
  active              BOOLEAN NOT NULL DEFAULT TRUE,

  -- Executive-specific (NULL for admin/manager roles)
  max_daily_capacity  INT          DEFAULT 10,
  success_rate        DECIMAL(5,2) DEFAULT 0,
  total_leads_alltime INT          DEFAULT 0,
  whatsapp_number     VARCHAR(20),
  locations           TEXT[]       DEFAULT ARRAY[]::TEXT[],
  expertise           TEXT[]       DEFAULT ARRAY[]::TEXT[],

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login  TIMESTAMPTZ,

  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(tenant_id, role);

-- ── LEADS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Lead info
  name            VARCHAR(200) NOT NULL,
  phone           VARCHAR(20)  NOT NULL,
  email           VARCHAR(300),
  source          VARCHAR(100) NOT NULL,
  location        VARCHAR(150) NOT NULL,
  budget          VARCHAR(100) NOT NULL,
  property_type   VARCHAR(100) NOT NULL,
  temperature     VARCHAR(20)  NOT NULL
                    CHECK (temperature IN ('hot', 'warm', 'cold')),
  priority_score  INT          NOT NULL DEFAULT 0
                    CHECK (priority_score BETWEEN 0 AND 100),
  notes           TEXT,

  -- Status pipeline
  status          VARCHAR(30)  NOT NULL DEFAULT 'unassigned'
                    CHECK (status IN (
                      'unassigned', 'assigned', 'contacted',
                      'site_visit', 'negotiation', 'closed', 'lost'
                    )),

  -- Assignment
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at     TIMESTAMPTZ,
  assignment_mode VARCHAR(20),   -- 'smart' | 'round-robin' | 'manual'
  assignment_reason TEXT,

  -- Duplicate tracking
  is_duplicate    BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_of    UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- UTM / source tracking
  utm_source      VARCHAR(200),
  utm_campaign    VARCHAR(200),
  source_url      TEXT,

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant      ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(tenant_id, temperature);
CREATE INDEX IF NOT EXISTS idx_leads_phone       ON leads(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_leads_created     ON leads(tenant_id, created_at DESC);

-- ── ASSIGNMENT HISTORY ────────────────────────
CREATE TABLE IF NOT EXISTS assignment_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  action      VARCHAR(50) NOT NULL
                CHECK (action IN ('assigned', 'reassigned', 'unassigned', 'status_changed')),
  from_user   UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user     UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_lead   ON assignment_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_history_tenant ON assignment_history(tenant_id, created_at DESC);

-- ── DAILY COUNTERS ────────────────────────────
-- Tracks per-executive, per-day lead counts
-- Replaces the in-memory currentLeads counter from the frontend
CREATE TABLE IF NOT EXISTS daily_counters (
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  count       INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_counters_tenant ON daily_counters(tenant_id, date);

-- ── ROUND ROBIN STATE ─────────────────────────
-- Persists round-robin pointers across server restarts
-- Replaces APP_SETTINGS.roundRobinPointers from the frontend
CREATE TABLE IF NOT EXISTS round_robin_state (
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location    VARCHAR(150) NOT NULL,
  pointer     INT          NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, location)
);

-- ── AUTO-UPDATE updated_at TRIGGER ───────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_tenants
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_leads
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SEED: Default tenant ───────────────────────
INSERT INTO tenants (name, slug, plan, settings)
VALUES (
  'Demo Agency',
  'demo-agency',
  'growth',
  '{
    "distributionMode": "smart",
    "allowDuplicates": false,
    "autoReassignOnCapacity": false
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
