// =============================================
//  src/modules/executives/executives.router.js
//  All executive routes — protected by JWT auth & RBAC
// =============================================

'use strict';

const express  = require('express');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { createExecutiveSchema, updateExecutiveSchema } = require('./executives.schema');
const execService = require('./executives.service');

const router = express.Router();

// Enforce authentication on all executive routes
router.use(authenticate);

// ─────────────────────────────────────────────
//  GET /api/executives — all executives with today's load
// ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const execs    = await execService.getExecutives(tenantId);
    res.json({ executives: execs, count: execs.length });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/executives — create new executive account (Admin only)
// ─────────────────────────────────────────────
router.post('/', requireRole(['admin']), validate(createExecutiveSchema), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const exec     = await execService.createExecutive(req.validated, tenantId);
    res.status(201).json({ message: 'Executive created', executive: exec });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  GET /api/executives/:id — profile + leads + stats
// ─────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    // Security: Executives can only view their own profile
    if (req.user.role === 'executive' && req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Access Denied: You can only view your own profile' });
    }

    const exec = await execService.getExecutiveById(req.params.id, tenantId);
    if (!exec) {
      return res.status(404).json({ error: 'Executive not found' });
    }
    res.json(exec);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  PATCH /api/executives/:id — update profile, capacity, status
// ─────────────────────────────────────────────
router.patch('/:id', validate(updateExecutiveSchema), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    // Security: Executives can only update their own profile
    if (req.user.role === 'executive') {
      if (req.params.id !== req.user.id) {
        return res.status(403).json({ error: 'Access Denied: You can only update your own profile' });
      }

      // Security: Executives cannot change their status or max daily capacity
      if (req.validated.active !== undefined || req.validated.max_daily_capacity !== undefined) {
        return res.status(403).json({
          error: 'Access Denied: Executives cannot modify status (active) or max daily capacity'
        });
      }
    }

    const exec = await execService.updateExecutive(req.params.id, tenantId, req.validated);
    if (!exec) {
      return res.status(404).json({ error: 'Executive not found' });
    }
    res.json({ message: 'Executive updated', executive: exec });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  GET /api/executives/:id/stats — performance stats
// ─────────────────────────────────────────────
router.get('/:id/stats', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    // Security: Executives can only view their own stats
    if (req.user.role === 'executive' && req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Access Denied: You can only view your own stats' });
    }

    const stats = await execService.getExecutiveStats(req.params.id, tenantId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/executives/redistribute — retry all unassigned leads (Admin only)
// ─────────────────────────────────────────────
router.post('/redistribute', requireRole(['admin']), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const result   = await execService.redistributeLeads(tenantId);
    res.json({ message: 'Re-distribution complete', ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
