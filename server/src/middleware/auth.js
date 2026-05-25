// =============================================
//  src/middleware/auth.js — JWT Auth Middleware
//  Verifies tokens, checks blacklist, & handles RBAC
// =============================================

'use strict';

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev_access_secret';

/**
 * Main authentication middleware
 * Verifies JWT access token, checks blacklist, and attaches user to request
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Format: Bearer <token>' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token missing from Authorization header' });
    }

    // 1. Verify token signature
    let decoded;
    try {
      decoded = jwt.verify(token, ACCESS_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid or malformed token' });
    }

    // 2. Check blacklist (using token's jti)
    if (decoded.jti) {
      const { rows } = await query(
        'SELECT jti FROM token_blacklist WHERE jti = $1 LIMIT 1',
        [decoded.jti]
      );
      if (rows.length > 0) {
        return res.status(401).json({ error: 'Token has been revoked/logged out' });
      }
    }

    // 3. Verify user still exists and is active in DB
    const { rows: userRows } = await query(
      'SELECT id, tenant_id, role, active FROM users WHERE id = $1 LIMIT 1',
      [decoded.sub]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    const dbUser = userRows[0];
    if (!dbUser.active) {
      return res.status(401).json({ error: 'User account has been deactivated' });
    }

    // 4. Attach user payload to request object
    req.user = {
      id:       dbUser.id,
      tenantId: dbUser.tenant_id,
      role:     dbUser.role,
      name:     decoded.name,
      jti:      decoded.jti
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * RBAC role restriction middleware
 * @param {string[]} allowedRoles - List of roles permitted to access the route
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access Denied: Required role is one of [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole
};
