// =============================================
//  src/modules/executives/executives.router.js
// =============================================

'use strict';

const express  = require('express');
const validate = require('../../middleware/validate');
const { createExecutiveSchema, updateExecutiveSchema } = require('./executives.schema');
const execService = require('./executives.service');

const router = express.Router();

// Temp tenant helper (replaced by JWT in Phase 2)
async function getTenantId(req) {
  const { query } = require('../../config/db');
  const { rows }  = await query("SELECT id FROM tenants WHERE slug = 'demo-agency' LIMIT 1");
  return rows[0]?.id;
}

// GET /api/executives — all executives with today's load
router.get('/', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const execs    = await execService.getExecutives(tenantId);
    res.json({ executives: execs, count: execs.length });
  } catch (err) { next(err); }
});

// POST /api/executives — create new executive account
router.post('/', validate(createExecutiveSchema), async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const exec     = await execService.createExecutive(req.validated, tenantId);
    res.status(201).json({ message: 'Executive created', executive: exec });
  } catch (err) { next(err); }
});

// GET /api/executives/:id — profile + leads + stats
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const exec     = await execService.getExecutiveById(req.params.id, tenantId);
    if (!exec) return res.status(404).json({ error: 'Executive not found' });
    res.json(exec);
  } catch (err) { next(err); }
});

// PATCH /api/executives/:id — update profile, capacity, status
router.patch('/:id', validate(updateExecutiveSchema), async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const exec     = await execService.updateExecutive(req.params.id, tenantId, req.validated);
    if (!exec) return res.status(404).json({ error: 'Executive not found' });
    res.json({ message: 'Executive updated', executive: exec });
  } catch (err) { next(err); }
});

// GET /api/executives/:id/stats — performance stats
router.get('/:id/stats', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const stats    = await execService.getExecutiveStats(req.params.id, tenantId);
    res.json(stats);
  } catch (err) { next(err); }
});

// POST /api/executives/redistribute — retry all unassigned leads
router.post('/redistribute', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const result   = await execService.redistributeLeads(tenantId);
    res.json({ message: 'Re-distribution complete', ...result });
  } catch (err) { next(err); }
});

module.exports = router;
