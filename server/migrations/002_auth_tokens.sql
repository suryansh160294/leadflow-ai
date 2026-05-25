-- =============================================
--  migrations/002_auth_tokens.sql
--  Refresh token store + admin user table
--  Run: psql -U postgres -d leadflow_dev -f 002_auth_tokens.sql
-- =============================================

-- ── REFRESH TOKENS ────────────────────────────
-- Stored server-side for rotation + revocation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,               -- SHA-256 hash of the token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  ip_address  VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens (expires_at);

-- ── TOKEN BLACKLIST ───────────────────────────
-- Access tokens that have been explicitly logged out
-- Only kept until expiry (auto-cleaned by expires_at)
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti         TEXT PRIMARY KEY,            -- JWT ID claim
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup of expired blacklist entries (run periodically)
-- DELETE FROM token_blacklist WHERE expires_at < NOW();

-- ── SEED: Admin user ──────────────────────────
-- Password: Admin@123 (bcrypt hash cost 12)
-- Change immediately after first login!
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'demo-agency' LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO users (tenant_id, name, email, phone, password_hash, role, active)
    VALUES (
      v_tenant_id,
      'Super Admin',
      'admin@leadflow.ai',
      '+91 98200 00001',
      -- bcrypt hash of 'Admin@123' with cost factor 12
      '$2a$12$pqasDjJY400f5F5sCO/Yb.h8rc5w4tJChoeTNGaEiK47YM8T00NAa',
      'admin',
      TRUE
    )
    ON CONFLICT (tenant_id, email) DO NOTHING;

    RAISE NOTICE 'Admin user seeded: admin@leadflow.ai / Admin@123';
  ELSE
    RAISE NOTICE 'Demo tenant not found — skipping admin seed';
  END IF;
END $$;
