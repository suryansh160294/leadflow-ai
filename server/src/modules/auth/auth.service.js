// =============================================
//  src/modules/auth/auth.service.js
//  JWT auth business logic:
//  login · generateTokens · refresh · logout · me
// =============================================

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../../config/db');

// ── Token config ──────────────────────────────
const ACCESS_SECRET   = process.env.JWT_SECRET          || 'dev_access_secret';
const REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET  || 'dev_refresh_secret';
const ACCESS_EXPIRY   = process.env.JWT_EXPIRES_IN      || '15m';
const REFRESH_EXPIRY  = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// ── Hash a refresh token for safe DB storage ──
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Parse expiry string like "7d" → milliseconds
function parseExpiry(str) {
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = String(str).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000; // default 7 days
  return parseInt(match[1]) * units[match[2]];
}

// ─────────────────────────────────────────────
//  1. GENERATE TOKEN PAIR
// ─────────────────────────────────────────────
function generateTokens(user) {
  const payload = {
    sub:      user.id,
    tenantId: user.tenant_id,
    role:     user.role,
    name:     user.name,
    jti:      crypto.randomUUID()   // unique token ID (for blacklisting)
  };

  const accessToken  = jwt.sign(payload, ACCESS_SECRET,  { expiresIn: ACCESS_EXPIRY });
  const refreshToken = jwt.sign({ sub: user.id, jti: crypto.randomUUID() },
                                  REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

  return { accessToken, refreshToken };
}

// ─────────────────────────────────────────────
//  2. LOGIN
// ─────────────────────────────────────────────
async function login(email, password, meta = {}) {
  // 1. Find user by email
  const { rows } = await query(
    `SELECT u.*, t.slug AS tenant_slug, t.plan AS tenant_plan, t.settings AS tenant_settings
     FROM   users u
     JOIN   tenants t ON t.id = u.tenant_id
     WHERE  u.email = $1 AND u.active = TRUE
     LIMIT  1`,
    [email.toLowerCase().trim()]
  );

  if (rows.length === 0) {
    throw { status: 401, message: 'Invalid email or password' };
  }

  const user = rows[0];

  // 2. Verify password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw { status: 401, message: 'Invalid email or password' };
  }

  // 3. Generate tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // 4. Store refresh token hash in DB
  const expiresAt = new Date(Date.now() + parseExpiry(REFRESH_EXPIRY));
  await query(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, hashToken(refreshToken), expiresAt, meta.userAgent || null, meta.ip || null]
  );

  // 5. Update last_login
  await query(
    'UPDATE users SET last_login = NOW() WHERE id = $1',
    [user.id]
  );

  // 6. Return safe user object (no password)
  const safeUser = {
    id:          user.id,
    name:        user.name,
    email:       user.email,
    role:        user.role,
    tenantId:    user.tenant_id,
    tenantSlug:  user.tenant_slug,
    tenantPlan:  user.tenant_plan,
    avatar_url:  user.avatar_url,
    active:      user.active,
    tenantSettings: user.tenant_settings
  };

  return { accessToken, refreshToken, user: safeUser };
}

// ─────────────────────────────────────────────
//  3. REFRESH TOKEN
// ─────────────────────────────────────────────
async function refresh(refreshToken) {
  // 1. Verify JWT signature
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    throw { status: 401, message: 'Invalid or expired refresh token' };
  }

  // 2. Check token in DB (not revoked, not expired)
  const tokenHash = hashToken(refreshToken);
  const { rows } = await query(
    `SELECT * FROM refresh_tokens
     WHERE  token_hash = $1
       AND  revoked    = FALSE
       AND  expires_at > NOW()
     LIMIT  1`,
    [tokenHash]
  );

  if (rows.length === 0) {
    throw { status: 401, message: 'Refresh token not found or already used' };
  }

  const storedToken = rows[0];

  // 3. Get user
  const { rows: userRows } = await query(
    `SELECT u.*, t.slug AS tenant_slug, t.plan AS tenant_plan
     FROM   users u
     JOIN   tenants t ON t.id = u.tenant_id
     WHERE  u.id = $1 AND u.active = TRUE`,
    [decoded.sub]
  );

  if (userRows.length === 0) {
    throw { status: 401, message: 'User not found or deactivated' };
  }

  const user = userRows[0];

  // 4. Rotate: revoke old token, issue new pair
  await transaction(async (client) => {
    await client.query(
      'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE id = $1',
      [storedToken.id]
    );

    const { refreshToken: newRefreshToken } = generateTokens(user);
    const expiresAt = new Date(Date.now() + parseExpiry(REFRESH_EXPIRY));

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(newRefreshToken), expiresAt]
    );

    user._newRefreshToken = newRefreshToken;
  });

  const { accessToken } = generateTokens(user);

  return {
    accessToken,
    refreshToken: user._newRefreshToken,
    user: {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      tenantId:   user.tenant_id,
      tenantSlug: user.tenant_slug
    }
  };
}

// ─────────────────────────────────────────────
//  4. LOGOUT
// ─────────────────────────────────────────────
async function logout(userId, accessJti, refreshToken) {
  await transaction(async (client) => {
    // Blacklist the access token JTI
    if (accessJti) {
      const decoded = jwt.decode(accessJti) || {};
      const expiresAt = decoded.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 15 * 60000);

      await client.query(
        `INSERT INTO token_blacklist (jti, user_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (jti) DO NOTHING`,
        [accessJti, userId, expiresAt]
      );
    }

    // Revoke refresh token if provided
    if (refreshToken) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked = TRUE, revoked_at = NOW()
         WHERE user_id = $1 AND token_hash = $2`,
        [userId, hashToken(refreshToken)]
      );
    }
  });
}

// ─────────────────────────────────────────────
//  5. CHANGE PASSWORD
// ─────────────────────────────────────────────
async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (rows.length === 0) throw { status: 404, message: 'User not found' };

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw { status: 401, message: 'Current password is incorrect' };

  const newHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

  // Revoke ALL existing refresh tokens (force re-login everywhere)
  await query(
    'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE user_id = $1',
    [userId]
  );
}

// ─────────────────────────────────────────────
//  6. GET ME (current user profile)
// ─────────────────────────────────────────────
async function getMe(userId) {
  const { rows } = await query(
    `SELECT
       u.id, u.name, u.email, u.phone, u.role, u.active,
       u.avatar_url, u.locations, u.expertise, u.max_daily_capacity,
       u.success_rate, u.total_leads_alltime, u.whatsapp_number,
       u.created_at, u.last_login,
       t.name AS tenant_name, t.slug AS tenant_slug, t.plan AS tenant_plan,
       t.settings AS tenant_settings
     FROM  users u
     JOIN  tenants t ON t.id = u.tenant_id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { login, refresh, logout, changePassword, getMe, generateTokens };
