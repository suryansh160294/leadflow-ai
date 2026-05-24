// =============================================
//  src/services/assignment.service.js
//  Core business logic — ported 1:1 from app.js
//  calcScore · detectDuplicate · assignLead
//  assignSmartMode · assignRoundRobin
// =============================================

'use strict';

const { query, transaction } = require('../config/db');

// ─────────────────────────────────────────────
//  1. PRIORITY SCORING
//  Same algorithm as frontend calcScore()
// ─────────────────────────────────────────────
const TEMP_SCORE = { hot: 40, warm: 25, cold: 10 };

const BUDGET_SCORE = {
  '> ₹2Cr':      30,
  '₹1Cr–₹2Cr':  24,
  '₹60L–₹1Cr':  18,
  '₹30L–₹60L':  12,
  '< ₹30L':       6
};

const SOURCE_SCORE = {
  'Referral':      20,
  'Walk-in':       18,
  'MagicBricks':   14,
  '99acres':       14,
  'Housing.com':   12,
  'Google Ads':    10,
  'NoBroker':       9,
  'Facebook Ads':   8,
  'Instagram':      7
};

const PROPERTY_SCORE = {
  'Villa':             10,
  'Penthouse':         10,
  '4BHK+ Apartment':    8,
  'Commercial':         7,
  '3BHK Apartment':     5,
  '2BHK Apartment':     4,
  'Plot':               4,
  '1BHK Apartment':     3
};

function calcScore(lead) {
  const t = TEMP_SCORE[lead.temperature]       || 0;
  const b = BUDGET_SCORE[lead.budget]          || 0;
  const s = SOURCE_SCORE[lead.source]          || 0;
  const p = PROPERTY_SCORE[lead.property_type] || 0;
  return {
    total: Math.min(100, t + b + s + p),
    breakdown: { temperature: t, budget: b, source: s, property: p }
  };
}

// ─────────────────────────────────────────────
//  2. DUPLICATE DETECTION
//  Checks phone (hard) and name (soft) against DB
// ─────────────────────────────────────────────
async function detectDuplicate(leadData, tenantId, excludeId = null) {
  // Normalize phone: strip all non-digits
  const normPhone = (leadData.phone || '').replace(/\D/g, '');

  if (normPhone.length >= 7) {
    const { rows } = await query(
      `SELECT id, name, phone, assigned_to, status, created_at
       FROM   leads
       WHERE  tenant_id = $1
         AND  REGEXP_REPLACE(phone, '\\D', '', 'g') = $2
         AND  ($3::uuid IS NULL OR id != $3)
       LIMIT  1`,
      [tenantId, normPhone, excludeId]
    );
    if (rows.length > 0) return { lead: rows[0], type: 'phone' };
  }

  // Normalize name: lowercase, collapse spaces
  const normName = (leadData.name || '').toLowerCase().replace(/\s+/g, '');
  if (normName.length >= 3) {
    const { rows } = await query(
      `SELECT id, name, phone, assigned_to, status, created_at
       FROM   leads
       WHERE  tenant_id = $1
         AND  LOWER(REGEXP_REPLACE(name, '\\s+', '', 'g')) = $2
         AND  ($3::uuid IS NULL OR id != $3)
       LIMIT  1`,
      [tenantId, normName, excludeId]
    );
    if (rows.length > 0) return { lead: rows[0], type: 'name' };
  }

  return null;
}

// ─────────────────────────────────────────────
//  3. ELIGIBLE EXECUTIVE QUERY
//  Returns active execs who cover the location
//  and haven't hit their daily capacity
// ─────────────────────────────────────────────
async function getEligibleExecutives(lead, tenantId) {
  const today = new Date().toISOString().split('T')[0];

  const { rows } = await query(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.whatsapp_number,
       u.max_daily_capacity,
       u.locations,
       COALESCE(dc.count, 0) AS today_count
     FROM   users u
     LEFT JOIN daily_counters dc
            ON dc.user_id = u.id AND dc.date = $1
     WHERE  u.tenant_id = $2
       AND  u.role       = 'executive'
       AND  u.active     = TRUE
       AND  $3 = ANY(u.locations)
       AND  COALESCE(dc.count, 0) < u.max_daily_capacity
     ORDER BY COALESCE(dc.count, 0) ASC, u.name ASC`,
    [today, tenantId, lead.location]
  );
  return rows;
}

// ─────────────────────────────────────────────
//  4. SMART ASSIGNMENT
//  Pick executive with lowest current daily load
// ─────────────────────────────────────────────
async function assignSmartMode(eligible) {
  // Already sorted by today_count ASC from query
  return eligible[0];
}

// ─────────────────────────────────────────────
//  5. ROUND-ROBIN ASSIGNMENT
//  Rotate per location, persisted in DB
// ─────────────────────────────────────────────
async function assignRoundRobin(eligible, location, tenantId, client) {
  // Upsert the pointer for this location
  const { rows } = await client.query(
    `INSERT INTO round_robin_state (tenant_id, location, pointer)
     VALUES ($1, $2, 0)
     ON CONFLICT (tenant_id, location) DO UPDATE
       SET pointer    = round_robin_state.pointer + 1,
           updated_at = NOW()
     RETURNING pointer`,
    [tenantId, location]
  );

  const pointer = rows[0].pointer;
  const idx     = pointer % eligible.length;
  return eligible[idx];
}

// ─────────────────────────────────────────────
//  6. MAIN ASSIGN FUNCTION
//  Called after createLead — runs the full pipeline
// ─────────────────────────────────────────────
async function assignLead(lead, tenantId, settings) {
  const eligible = await getEligibleExecutives(lead, tenantId);

  if (eligible.length === 0) {
    return {
      status:            'unassigned',
      assignedTo:        null,
      assignedExecId:    null,
      assignmentReason:  'No eligible executive (check location coverage, capacity, and active status).',
      assignmentMode:    null
    };
  }

  const mode = settings.distributionMode || 'smart';
  let chosen;

  await transaction(async (client) => {
    if (mode === 'round-robin') {
      chosen = await assignRoundRobin(eligible, lead.location, tenantId, client);
    } else {
      chosen = await assignSmartMode(eligible);
    }

    // Atomically increment daily counter
    await client.query(
      `INSERT INTO daily_counters (user_id, tenant_id, date, count)
       VALUES ($1, $2, CURRENT_DATE, 1)
       ON CONFLICT (user_id, date)
       DO UPDATE SET count = daily_counters.count + 1`,
      [chosen.id, tenantId]
    );

    // Update the lead in DB
    await client.query(
      `UPDATE leads
       SET  assigned_to      = $1,
            assigned_at      = NOW(),
            status           = 'assigned',
            assignment_mode  = $2,
            assignment_reason= $3,
            updated_at       = NOW()
       WHERE id = $4`,
      [
        chosen.id,
        mode,
        `${mode === 'round-robin' ? 'Round-robin' : 'Smart'} match: "${lead.location}" → ${chosen.name}`,
        lead.id
      ]
    );

    // Write history entry
    await client.query(
      `INSERT INTO assignment_history
         (lead_id, tenant_id, action, to_user, reason, metadata)
       VALUES ($1, $2, 'assigned', $3, $4, $5::jsonb)`,
      [
        lead.id,
        tenantId,
        chosen.id,
        `Assigned via ${mode} mode`,
        JSON.stringify({ mode, score: lead.priority_score, location: lead.location })
      ]
    );
  });

  return {
    status:           'assigned',
    assignedTo:       chosen.name,
    assignedExecId:   chosen.id,
    assignedExec:     chosen,
    assignmentReason: `${mode === 'round-robin' ? 'Round-robin' : 'Smart'} match: "${lead.location}" → ${chosen.name}`,
    assignmentMode:   mode
  };
}

// ─────────────────────────────────────────────
//  7. REASSIGN
//  Move a lead from one executive to another
// ─────────────────────────────────────────────
async function reassignLead(leadId, newExecId, tenantId, changedById, reason) {
  return transaction(async (client) => {
    // Get the lead
    const { rows: leadRows } = await client.query(
      'SELECT * FROM leads WHERE id = $1 AND tenant_id = $2',
      [leadId, tenantId]
    );
    if (leadRows.length === 0) throw { status: 404, message: 'Lead not found' };
    const lead = leadRows[0];

    // Get new exec
    const { rows: execRows } = await client.query(
      'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND active = TRUE',
      [newExecId, tenantId]
    );
    if (execRows.length === 0) throw { status: 404, message: 'Executive not found or inactive' };
    const newExec = execRows[0];

    const prevExecId = lead.assigned_to;

    // Decrement old exec's counter (if had one)
    if (prevExecId) {
      await client.query(
        `UPDATE daily_counters
         SET count = GREATEST(count - 1, 0)
         WHERE user_id = $1 AND date = CURRENT_DATE`,
        [prevExecId]
      );
    }

    // Increment new exec's counter
    await client.query(
      `INSERT INTO daily_counters (user_id, tenant_id, date, count)
       VALUES ($1, $2, CURRENT_DATE, 1)
       ON CONFLICT (user_id, date)
       DO UPDATE SET count = daily_counters.count + 1`,
      [newExecId, tenantId]
    );

    // Update lead
    await client.query(
      `UPDATE leads
       SET  assigned_to     = $1,
            assigned_at     = NOW(),
            status          = 'assigned',
            assignment_mode = 'manual',
            updated_at      = NOW()
       WHERE id = $2`,
      [newExecId, leadId]
    );

    // History entry
    await client.query(
      `INSERT INTO assignment_history
         (lead_id, tenant_id, action, from_user, to_user, changed_by, reason)
       VALUES ($1, $2, 'reassigned', $3, $4, $5, $6)`,
      [leadId, tenantId, prevExecId, newExecId, changedById, reason || 'Manual reassignment']
    );

    return { lead: { ...lead, assigned_to: newExecId }, newExec };
  });
}

module.exports = { calcScore, detectDuplicate, assignLead, reassignLead, getEligibleExecutives };
