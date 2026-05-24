// =============================================
//  src/modules/leads/leads.router.js
//  All lead routes — fully wired to service
// =============================================

'use strict';

const express  = require('express');
const validate = require('../../middleware/validate');
const {
  createLeadSchema,
  updateLeadSchema,
  reassignLeadSchema,
  checkDupSchema
} = require('./leads.schema');
const leadsService = require('./leads.service');
const { detectDuplicate, reassignLead } = require('../../services/assignment.service');

const router = express.Router();

// ── TEMP: hardcoded tenant until auth is added ─
// In Phase 2, this will come from req.user.tenantId (JWT)
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID || null;

async function getTenantId(req) {
  if (DEMO_TENANT_ID) return DEMO_TENANT_ID;
  // Fall back: look up the single demo tenant
  const { query } = require('../../config/db');
  const { rows }  = await query("SELECT id FROM tenants WHERE slug = 'demo-agency' LIMIT 1");
  return rows[0]?.id;
}

// ─────────────────────────────────────────────
//  GET /api/leads
//  Query params: page, limit, temperature, status,
//                source, exec_id, q (search)
// ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const result   = await leadsService.getLeads(tenantId, req.query);
    res.json(result);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  GET /api/leads/stats
//  Dashboard aggregate numbers
// ─────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const stats    = await leadsService.getStats(tenantId);
    res.json(stats);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  POST /api/leads/check-dup
//  Check if a phone/name already exists
// ─────────────────────────────────────────────
router.post('/check-dup', validate(checkDupSchema), async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const dup      = await detectDuplicate(req.validated, tenantId);
    res.json({
      isDuplicate: !!dup,
      type:         dup?.type  || null,
      existing:     dup?.lead  || null
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  POST /api/leads
//  Create lead → auto score → auto assign
// ─────────────────────────────────────────────
router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const result   = await leadsService.createLead(req.validated, tenantId);

    // Duplicate blocked (and force=false)
    if (result.isDuplicate) {
      return res.status(409).json({
        error:      'Duplicate Lead',
        type:        result.duplicate.type,
        existing:    result.duplicate.lead,
        hint:        'Set force=true to submit anyway'
      });
    }

    const statusCode = result.lead.status === 'assigned' ? 201 : 207;
    res.status(statusCode).json({
      message:        result.lead.status === 'assigned' ? 'Lead created and assigned' : 'Lead created but unassigned',
      lead:           result.lead,
      scoreBreakdown: result.scoreBreakdown
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  GET /api/leads/:id
//  Single lead with full assignment history
// ─────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const lead     = await leadsService.getLeadById(req.params.id, tenantId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  PATCH /api/leads/:id
//  Update status, notes, or temperature
// ─────────────────────────────────────────────
router.patch('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const lead     = await leadsService.updateLead(req.params.id, tenantId, req.validated);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead updated', lead });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  POST /api/leads/:id/reassign
//  Reassign to a different executive
// ─────────────────────────────────────────────
router.post('/:id/reassign', validate(reassignLeadSchema), async (req, res, next) => {
  try {
    const tenantId  = await getTenantId(req);
    const changedBy = null; // Will be req.user.id after auth
    const result    = await reassignLead(
      req.params.id,
      req.validated.exec_id,
      tenantId,
      changedBy,
      req.validated.reason
    );
    res.json({ message: 'Lead reassigned', ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─────────────────────────────────────────────
//  GET /api/leads/:id/history
//  Assignment history timeline
// ─────────────────────────────────────────────
router.get('/:id/history', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const lead     = await leadsService.getLeadById(req.params.id, tenantId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ history: lead.history });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
//  DELETE /api/leads/:id
//  Soft delete — marks as 'lost'
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = await getTenantId(req);
    const deleted  = await leadsService.deleteLead(req.params.id, tenantId);
    if (!deleted) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead archived', id: deleted.id });
  } catch (err) { next(err); }
});

module.exports = router;
