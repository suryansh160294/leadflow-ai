// =============================================
//  src/modules/auth/auth.router.js
//  HTTP routes for auth, login, refresh, logout, password change
// =============================================

'use strict';

const express      = require('express');
const validate     = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const authService  = require('./auth.service');
const { loginSchema, refreshSchema, changePasswordSchema } = require('./auth.schema');

const router = express.Router();

// ── 1. LOGIN ──────────────────────────────────
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Capture metadata for security logging
    const meta = {
      userAgent: req.headers['user-agent'],
      ip:        req.ip || req.connection.remoteAddress
    };

    const result = await authService.login(email, password, meta);
    
    // Also set a secure httpOnly cookie for refresh token to prevent XSS theft
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message:      'Login successful',
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken, // also return in body for mobile/SPA clients
      user:         result.user
    });
  } catch (err) {
    next(err);
  }
});

// ── 2. REFRESH TOKEN ──────────────────────────
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message:      'Token refreshed successfully',
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
      user:         result.user
    });
  } catch (err) {
    next(err);
  }
});

// ── 3. GET CURRENT USER PROFILE ───────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const profile = await authService.getMe(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// ── 4. CHANGE PASSWORD ────────────────────────
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    
    // Clear cookie as password change revokes refresh tokens
    res.clearCookie('refreshToken');

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    next(err);
  }
});

// ── 5. LOGOUT ─────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    const accessJti = req.user.jti;

    await authService.logout(req.user.id, accessJti, refreshToken);

    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// ── 6. TENANT SETTINGS ─────────────────────────
router.patch('/tenant/settings', authenticate, requireRole(['admin']), async (req, res, next) => {
  try {
    const { settings } = req.body;
    const { query } = require('../../config/db');
    const { rows } = await query(
      'UPDATE tenants SET settings = settings || $1 WHERE id = $2 RETURNING settings',
      [JSON.stringify(settings), req.user.tenantId]
    );
    res.json({ message: 'Settings updated successfully', settings: rows[0].settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
