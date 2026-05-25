// =============================================
//  src/modules/leads/leads.service.js
//  All leads DB operations
// =============================================

'use strict';

const { query, transaction } = require('../../config/db');
const { calcScore, detectDuplicate, assignLead } = require('../../services/assignment.service');

// ─────────────────────────────────────────────
//  GET /api/leads — paginated + filtered list
// ─────────────────────────────────────────────
async function getLeads(tenantId, filters = {}) {
  const {
    page        = 1,
    limit       = 50,
    temperature,
    status,
    source,
    exec_id,
    q           // search query
  } = filters;

  const offset = (page - 1) * limit;
  const params = [tenantId];
  const conditions = ['l.tenant_id = $1'];
  let p = 2;

  if (temperature) { conditions.push(`l.temperature = $${p++}`); params.push(temperature); }
  if (status)      { conditions.push(`l.status = $${p++}`);      params.push(status); }
  if (source)      { conditions.push(`l.source = $${p++}`);      params.push(source); }
  if (exec_id)     { conditions.push(`l.assigned_to = $${p++}`); params.push(exec_id); }

  if (q) {
    conditions.push(`(
      l.name    ILIKE $${p}   OR
      l.phone   ILIKE $${p}   OR
      l.location ILIKE $${p}  OR
      l.source  ILIKE $${p}
    )`);
    params.push(`%${q}%`);
    p++;
  }

  const where = conditions.join(' AND ');

  const { rows: leads } = await query(
    `SELECT
       l.*,
       u.name  AS assigned_exec_name,
       u.email AS assigned_exec_email
     FROM  leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM leads l WHERE ${where}`,
    params
  );

  return {
    leads,
    pagination: {
      page:       parseInt(page),
      limit:      parseInt(limit),
      total:      parseInt(countRows[0].count),
      totalPages: Math.ceil(parseInt(countRows[0].count) / limit)
    }
  };
}

// ─────────────────────────────────────────────
//  GET /api/leads/:id — single lead with history
// ─────────────────────────────────────────────
async function getLeadById(leadId, tenantId) {
  const { rows } = await query(
    `SELECT
       l.*,
       u.name  AS assigned_exec_name,
       u.email AS assigned_exec_email,
       u.whatsapp_number AS assigned_exec_whatsapp
     FROM  leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     WHERE l.id = $1 AND l.tenant_id = $2`,
    [leadId, tenantId]
  );

  if (rows.length === 0) return null;
  const lead = rows[0];

  // Fetch history
  const { rows: history } = await query(
    `SELECT
       h.*,
       fu.name AS from_user_name,
       tu.name AS to_user_name,
       cu.name AS changed_by_name
     FROM  assignment_history h
     LEFT JOIN users fu ON fu.id = h.from_user
     LEFT JOIN users tu ON tu.id = h.to_user
     LEFT JOIN users cu ON cu.id = h.changed_by
     WHERE h.lead_id = $1
     ORDER BY h.created_at DESC`,
    [leadId]
  );

  return { ...lead, history };
}

// ─────────────────────────────────────────────
//  POST /api/leads — create + auto-assign
// ─────────────────────────────────────────────
async function createLead(data, tenantId) {
  // 1. Score the lead
  const score = calcScore(data);

  // 2. Check for duplicates (unless force=true)
  if (!data.force) {
    const dup = await detectDuplicate(data, tenantId);
    if (dup) return { isDuplicate: true, duplicate: dup };
  }

  // 3. Insert the lead
  const { rows } = await query(
    `INSERT INTO leads (
       tenant_id, name, phone, email, source, location,
       budget, property_type, temperature, priority_score,
       notes, utm_source, utm_campaign, source_url, is_duplicate
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
     ) RETURNING *`,
    [
      tenantId,
      data.name,
      data.phone,
      data.email || null,
      data.source,
      data.location,
      data.budget,
      data.property_type,
      data.temperature,
      score.total,
      data.notes || null,
      data.utm_source   || null,
      data.utm_campaign || null,
      data.source_url   || null,
      !!data.force  // is_duplicate = true if overriding warning
    ]
  );

  const lead = rows[0];

  // 4. Get tenant settings (for distribution mode)
  const { rows: tenantRows } = await query(
    'SELECT settings FROM tenants WHERE id = $1',
    [tenantId]
  );
  const settings = tenantRows[0]?.settings || { distributionMode: 'smart' };

  // 5. Run assignment engine
  const assignment = await assignLead(lead, tenantId, settings);

  return {
    isDuplicate: false,
    lead: { ...lead, ...assignment },
    scoreBreakdown: score.breakdown
  };
}

// ─────────────────────────────────────────────
//  PATCH /api/leads/:id — update status/notes
// ─────────────────────────────────────────────
async function updateLead(leadId, tenantId, updates, changedById = null) {
  return transaction(async (client) => {
    // 1. Get original lead details to check current status
    const { rows: originalRows } = await client.query(
      'SELECT status FROM leads WHERE id = $1 AND tenant_id = $2',
      [leadId, tenantId]
    );
    if (originalRows.length === 0) return null;
    const oldStatus = originalRows[0].status;

    // 2. Build and execute dynamic update
    const fields = [];
    const params = [leadId, tenantId];
    let p = 3;

    if (updates.status !== undefined) {
      fields.push(`status = $${p++}`);
      params.push(updates.status);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${p++}`);
      params.push(updates.notes);
    }
    if (updates.temperature !== undefined) {
      fields.push(`temperature = $${p++}`);
      params.push(updates.temperature);
    }

    if (fields.length === 0) return { id: leadId }; // No fields to update

    const { rows } = await client.query(
      `UPDATE leads
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      params
    );
    const updatedLead = rows[0];

    // 3. Log history entry if status has changed
    if (updates.status !== undefined && updates.status !== oldStatus) {
      await client.query(
        `INSERT INTO assignment_history (
           lead_id, tenant_id, action, changed_by, reason, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          leadId,
          tenantId,
          'status_changed',
          changedById,
          `Status updated from "${oldStatus}" to "${updates.status}"`,
          JSON.stringify({ old_status: oldStatus, new_status: updates.status })
        ]
      );
    }

    return updatedLead || null;
  });
}

// ─────────────────────────────────────────────
//  DELETE /api/leads/:id — soft delete
// ─────────────────────────────────────────────
async function deleteLead(leadId, tenantId) {
  const { rows } = await query(
    `UPDATE leads
     SET status = 'lost', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [leadId, tenantId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────
//  GET /api/leads/stats — dashboard numbers
// ─────────────────────────────────────────────
async function getStats(tenantId, execId = null) {
  const params = [tenantId];
  let conditions = 'tenant_id = $1';
  
  if (execId) {
    conditions += ' AND assigned_to = $2';
    params.push(execId);
  }

  const { rows } = await query(
    `SELECT
       COUNT(*)                                       AS total,
       COUNT(*) FILTER (WHERE status != 'unassigned') AS assigned,
       COUNT(*) FILTER (WHERE status = 'unassigned') AS unassigned,
       COUNT(*) FILTER (WHERE temperature = 'hot')   AS hot,
       COUNT(*) FILTER (WHERE temperature = 'warm')  AS warm,
       COUNT(*) FILTER (WHERE temperature = 'cold')  AS cold,
       ROUND(AVG(priority_score))                    AS avg_score,
       COUNT(*) FILTER (WHERE is_duplicate = TRUE)   AS duplicates
     FROM leads
     WHERE ${conditions}`,
    params
  );
  return rows[0];
}

module.exports = { getLeads, getLeadById, createLead, updateLead, deleteLead, getStats };
