// =============================================
//  src/modules/leads/leads.router.js
//  All lead routes — protected by JWT auth & RBAC
// =============================================

'use strict';

const express  = require('express');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const {
  createLeadSchema,
  updateLeadSchema,
  reassignLeadSchema,
  checkDupSchema
} = require('./leads.schema');
const leadsService = require('./leads.service');
const { detectDuplicate, reassignLead } = require('../../services/assignment.service');

const router = express.Router();

// Enforce authentication on all lead routes
router.use(authenticate);

// ─────────────────────────────────────────────
//  GET /api/leads
//  Query params: page, limit, temperature, status,
//                source, exec_id, q (search)
// ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const filters  = { ...req.query };

    // Security: Executives can only see leads assigned to themselves
    if (req.user.role === 'executive') {
      filters.exec_id = req.user.id;
    }

    const result = await leadsService.getLeads(tenantId, filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  GET /api/leads/stats
//  Dashboard aggregate numbers
// ─────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    
    // Security: Executives only get stats for their own leads
    const execId = req.user.role === 'executive' ? req.user.id : null;
    
    const stats = await leadsService.getStats(tenantId, execId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/leads/check-dup
//  Check if a phone/name already exists
// ─────────────────────────────────────────────
router.post('/check-dup', validate(checkDupSchema), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const dup      = await detectDuplicate(req.validated, tenantId);
    res.json({
      isDuplicate: !!dup,
      type:         dup?.type  || null,
      existing:     dup?.lead  || null
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/leads
//  Create lead → auto score → auto assign
// ─────────────────────────────────────────────
router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
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
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  GET /api/leads/:id
//  Single lead with full assignment history
// ─────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const lead     = await leadsService.getLeadById(req.params.id, tenantId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Security: Executives can only view their own leads
    if (req.user.role === 'executive' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access Denied: You are not assigned to this lead' });
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  PATCH /api/leads/:id
//  Update status, notes, or temperature
// ─────────────────────────────────────────────
router.patch('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    
    // First, verify existence and ownership of lead
    const leadToCheck = await leadsService.getLeadById(req.params.id, tenantId);
    if (!leadToCheck) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Security: Executives can only update their own leads
    if (req.user.role === 'executive' && leadToCheck.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access Denied: You are not assigned to this lead' });
    }

    const lead = await leadsService.updateLead(req.params.id, tenantId, req.validated);
    res.json({ message: 'Lead updated', lead });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  POST /api/leads/:id/reassign
//  Reassign to a different executive (Admin only)
// ─────────────────────────────────────────────
router.post('/:id/reassign', requireRole(['admin']), validate(reassignLeadSchema), async (req, res, next) => {
  try {
    const tenantId  = req.user.tenantId;
    const changedBy = req.user.id;
    const result    = await reassignLead(
      req.params.id,
      req.validated.exec_id,
      tenantId,
      changedBy,
      req.validated.reason
    );
    res.json({ message: 'Lead reassigned', ...result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────
//  GET /api/leads/:id/history
//  Assignment history timeline
// ─────────────────────────────────────────────
router.get('/:id/history', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const lead     = await leadsService.getLeadById(req.params.id, tenantId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Security: Executives can only view their own lead's history
    if (req.user.role === 'executive' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access Denied: You are not assigned to this lead' });
    }

    res.json({ history: lead.history });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
//  DELETE /api/leads/:id
//  Soft delete — marks as 'lost' (Admin only)
// ─────────────────────────────────────────────
router.delete('/:id', requireRole(['admin']), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const deleted  = await leadsService.deleteLead(req.params.id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ message: 'Lead archived', id: deleted.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
