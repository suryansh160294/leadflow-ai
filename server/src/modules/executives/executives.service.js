// =============================================
//  src/modules/executives/executives.service.js
// =============================================

'use strict';

const bcrypt = require('bcryptjs');
const { query, transaction } = require('../../config/db');

async function getExecutives(tenantId) {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await query(
    `SELECT
       u.id, u.name, u.email, u.phone, u.whatsapp_number,
       u.role, u.active, u.locations, u.expertise,
       u.max_daily_capacity, u.success_rate, u.total_leads_alltime,
       u.avatar_url, u.created_at, u.last_login,
       COALESCE(dc.count, 0)               AS today_count,
       COUNT(l.id)                          AS total_assigned
     FROM  users u
     LEFT JOIN daily_counters dc ON dc.user_id = u.id AND dc.date = $2
     LEFT JOIN leads l           ON l.assigned_to = u.id AND l.tenant_id = $1
     WHERE u.tenant_id = $1 AND u.role = 'executive'
     GROUP BY u.id, dc.count
     ORDER BY u.name ASC`,
    [tenantId, today]
  );
  return rows;
}

async function getExecutiveById(execId, tenantId) {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await query(
    `SELECT
       u.*,
       COALESCE(dc.count, 0) AS today_count
     FROM  users u
     LEFT JOIN daily_counters dc ON dc.user_id = u.id AND dc.date = $2
     WHERE u.id = $1 AND u.tenant_id = $3 AND u.role = 'executive'`,
    [execId, today, tenantId]
  );
  if (rows.length === 0) return null;
  const exec = rows[0];
  delete exec.password_hash; // never return password

  // Get their assigned leads
  const { rows: leads } = await query(
    `SELECT id, name, phone, location, budget, temperature,
            priority_score, status, created_at
     FROM   leads
     WHERE  assigned_to = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [execId, tenantId]
  );

  return { ...exec, leads };
}

async function createExecutive(data, tenantId) {
  const password_hash = await bcrypt.hash(data.password, 12);
  const { rows } = await query(
    `INSERT INTO users (
       tenant_id, name, email, phone, whatsapp_number, password_hash,
       role, locations, expertise, max_daily_capacity
     ) VALUES ($1,$2,$3,$4,$5,$6,'executive',$7,$8,$9)
     RETURNING id, name, email, phone, role, active, locations,
               expertise, max_daily_capacity, created_at`,
    [
      tenantId, data.name, data.email, data.phone || null,
      data.whatsapp_number || null, password_hash,
      data.locations, data.expertise, data.max_daily_capacity
    ]
  );
  return rows[0];
}

async function updateExecutive(execId, tenantId, updates) {
  const fields = [];
  const params = [execId, tenantId];
  let p = 3;

  const allowed = ['name','phone','whatsapp_number','locations','expertise','max_daily_capacity','active'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${p++}`);
      params.push(updates[key]);
    }
  }
  if (fields.length === 0) return null;

  const { rows } = await query(
    `UPDATE users
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND role = 'executive'
     RETURNING id, name, email, active, locations, max_daily_capacity, updated_at`,
    params
  );
  return rows[0] || null;
}

async function getExecutiveStats(execId, tenantId) {
  const { rows } = await query(
    `SELECT
       COUNT(*)                                          AS total_assigned,
       COUNT(*) FILTER (WHERE temperature = 'hot')      AS hot_leads,
       COUNT(*) FILTER (WHERE temperature = 'warm')     AS warm_leads,
       COUNT(*) FILTER (WHERE temperature = 'cold')     AS cold_leads,
       COUNT(*) FILTER (WHERE status = 'closed')        AS closed,
       COUNT(*) FILTER (WHERE status = 'contacted')     AS contacted,
       ROUND(AVG(priority_score))                       AS avg_score
     FROM  leads
     WHERE assigned_to = $1 AND tenant_id = $2`,
    [execId, tenantId]
  );
  return rows[0];
}

async function redistributeLeads(tenantId) {
  // Get all unassigned leads
  const { rows: unassigned } = await query(
    `SELECT * FROM leads
     WHERE tenant_id = $1 AND status = 'unassigned'
     ORDER BY priority_score DESC`,
    [tenantId]
  );

  const { assignLead } = require('../../services/assignment.service');
  const { rows: tenantRows } = await query(
    'SELECT settings FROM tenants WHERE id = $1', [tenantId]
  );
  const settings = tenantRows[0]?.settings || { distributionMode: 'smart' };

  let assigned = 0;
  for (const lead of unassigned) {
    const result = await assignLead(lead, tenantId, settings);
    if (result.status === 'assigned') assigned++;
  }

  return { attempted: unassigned.length, assigned, stillUnassigned: unassigned.length - assigned };
}

module.exports = {
  getExecutives, getExecutiveById, createExecutive,
  updateExecutive, getExecutiveStats, redistributeLeads
};
