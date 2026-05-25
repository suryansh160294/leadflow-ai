// =============================================
//  e2e-test.js — End-to-End API Test Suite
//  Tests all assignment scenarios against live server
//  Run with: node e2e-test.js
// =============================================

'use strict';

const BASE = 'http://localhost:3000';

// ── Colour helpers ────────────────────────────
const G = s => `\x1b[32m${s}\x1b[0m`;   // green
const R = s => `\x1b[31m${s}\x1b[0m`;   // red
const Y = s => `\x1b[33m${s}\x1b[0m`;   // yellow
const B = s => `\x1b[36m${s}\x1b[0m`;   // cyan
const W = s => `\x1b[1m${s}\x1b[0m`;    // bold

let passed = 0, failed = 0;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function test(name, fn) {
  return fn()
    .then(() => { passed++; console.log(G(`  ✅  PASS`) + `  ${name}`); })
    .catch(err => { failed++; console.log(R(`  ❌  FAIL`) + `  ${name}\n       ${R(err.message)}`); });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────
async function runTests() {
  console.log('');
  console.log(W('  ╔══════════════════════════════════════════╗'));
  console.log(W('  ║   LeadFlow AI — E2E Test Suite           ║'));
  console.log(W('  ╚══════════════════════════════════════════╝'));
  console.log('');
  await sleep(1000); // let server boot

  // ── T1: Health Check ─────────────────────────
  console.log(B('\n  📡  Test Group 1 — Server & Health\n'));

  await test('GET /health returns status ok', async () => {
    const r = await api('GET', '/health');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'ok', 'Expected status=ok');
    assert(r.body.service === 'LeadFlow AI API', 'Wrong service name');
  });

  // ── T2: Dashboard Stats ───────────────────────
  await test('GET /api/leads/stats returns correct totals', async () => {
    const r = await api('GET', '/api/leads/stats');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(parseInt(r.body.total) === 22, `Expected 22 leads, got ${r.body.total}`);
    assert(parseInt(r.body.assigned) === 22, `Expected 22 assigned, got ${r.body.assigned}`);
    assert(parseInt(r.body.unassigned) === 0, `Expected 0 unassigned, got ${r.body.unassigned}`);
    assert(parseInt(r.body.hot) === 8, `Expected 8 hot, got ${r.body.hot}`);
  });

  // ── T3: Executives List ───────────────────────
  console.log(B('\n  👥  Test Group 2 — Executives API\n'));

  let execId, inactiveExecId;

  await test('GET /api/executives returns 10 executives', async () => {
    const r = await api('GET', '/api/executives');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.count === 10, `Expected 10 execs, got ${r.body.count}`);

    // Grab active exec for later
    const active   = r.body.executives.find(e => e.active);
    const inactive = r.body.executives.find(e => !e.active);
    execId         = active?.id;
    inactiveExecId = inactive?.id;

    assert(execId,         'No active executive found');
    assert(inactiveExecId, 'No inactive executive found (Deepika Rao)');
  });

  await test('GET /api/executives/:id returns profile with leads', async () => {
    const r = await api('GET', `/api/executives/${execId}`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.id === execId, 'Wrong exec returned');
    assert(Array.isArray(r.body.leads), 'No leads array in response');
    assert(!r.body.password_hash, 'password_hash must NOT be returned!');
  });

  await test('GET /api/executives/:id/stats returns performance data', async () => {
    const r = await api('GET', `/api/executives/${execId}/stats`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.total_assigned !== undefined, 'Missing total_assigned');
    assert(r.body.hot_leads !== undefined, 'Missing hot_leads');
  });

  // ── T4: Lead Creation & Assignment ───────────
  console.log(B('\n  📋  Test Group 3 — Lead Creation & Auto-Assignment\n'));

  let newLeadId;

  await test('POST /api/leads creates lead with correct score', async () => {
    const r = await api('POST', '/api/leads', {
      name:          'Test Lead — Hot Bandra',
      phone:         '+91 80000 99001',
      source:        'Referral',
      location:      'Bandra',
      budget:        '> ₹2Cr',
      property_type: 'Penthouse',
      temperature:   'hot'
    });
    // 201 = assigned, 207 = unassigned
    assert([201, 207].includes(r.status), `Expected 201/207, got ${r.status}`);
    assert(r.body.lead?.name === 'Test Lead — Hot Bandra', 'Wrong lead name');
    assert(r.body.lead?.priority_score === 100, `Expected score=100, got ${r.body.lead?.priority_score}`);
    assert(r.body.scoreBreakdown, 'Missing scoreBreakdown');

    newLeadId = r.body.lead?.id;
  });

  await test('New hot lead gets assigned to eligible Bandra executive', async () => {
    const r = await api('GET', `/api/leads/${newLeadId}`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.status === 'assigned', `Expected status=assigned, got ${r.body.status}`);
    assert(r.body.assigned_to !== null, 'Exec should be assigned');
    assert(r.body.assignment_mode === 'smart', `Expected smart mode, got ${r.body.assignment_mode}`);
  });

  await test('New lead has an assignment history entry', async () => {
    const r = await api('GET', `/api/leads/${newLeadId}/history`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.history.length >= 1, `Expected ≥1 history entry, got ${r.body.history.length}`);
    assert(r.body.history[0].action === 'assigned', `Expected action=assigned`);
  });

  // ── T5: Duplicate Detection ───────────────────
  console.log(B('\n  🔍  Test Group 4 — Duplicate Detection\n'));

  await test('POST /api/leads BLOCKS duplicate phone number', async () => {
    const r = await api('POST', '/api/leads', {
      name:          'Different Name Same Phone',
      phone:         '+91 80000 99001',    // ← same phone as above
      source:        'Google Ads',
      location:      'Andheri',
      budget:        '₹30L–₹60L',
      property_type: '1BHK Apartment',
      temperature:   'cold'
    });
    assert(r.status === 409, `Expected 409 Conflict, got ${r.status}`);
    assert(r.body.error === 'Duplicate Lead', `Expected "Duplicate Lead", got "${r.body.error}"`);
    assert(r.body.type === 'phone', `Expected type=phone, got "${r.body.type}"`);
  });

  await test('POST /api/leads/check-dup detects existing phone', async () => {
    const r = await api('POST', '/api/leads/check-dup', {
      phone: '+91 80000 99001'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.isDuplicate === true, 'Expected isDuplicate=true');
    assert(r.body.type === 'phone', `Expected type=phone`);
    assert(r.body.existing !== null, 'Expected existing lead data');
  });

  await test('POST /api/leads ALLOWS duplicate with force=true', async () => {
    const r = await api('POST', '/api/leads', {
      name:          'Forced Duplicate Lead',
      phone:         '+91 80000 99001',
      source:        'Google Ads',
      location:      'Andheri',
      budget:        '₹30L–₹60L',
      property_type: '1BHK Apartment',
      temperature:   'cold',
      force:         true                  // ← override
    });
    assert([201, 207].includes(r.status), `Expected 201/207, got ${r.status}`);
    assert(r.body.lead?.is_duplicate === true, 'Expected is_duplicate=true');
  });

  // ── T6: Validation ────────────────────────────
  console.log(B('\n  🛡️   Test Group 5 — Validation & Error Handling\n'));

  await test('POST /api/leads with missing fields returns 400', async () => {
    const r = await api('POST', '/api/leads', {
      name: 'Incomplete Lead'
      // missing phone, source, location, budget, property_type, temperature
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    assert(r.body.error === 'Validation Error', `Expected "Validation Error"`);
    assert(Array.isArray(r.body.details), 'Expected details array');
    assert(r.body.details.length > 0, 'Expected at least 1 validation error');
  });

  await test('GET /api/leads/:id with bad UUID returns 400', async () => {
    const r = await api('GET', '/api/leads/not-a-uuid');
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test('GET /api/leads/:id with unknown UUID returns 404', async () => {
    const r = await api('GET', '/api/leads/00000000-0000-0000-0000-000000000000');
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  // ── T7: Lead Filtering & Pagination ──────────
  console.log(B('\n  🔎  Test Group 6 — Filtering & Pagination\n'));

  await test('GET /api/leads?temperature=hot filters correctly', async () => {
    const r = await api('GET', '/api/leads?temperature=hot');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.leads.every(l => l.temperature === 'hot'), 'Non-hot lead in results');
    assert(r.body.pagination, 'Missing pagination');
  });

  await test('GET /api/leads?q=Bandra filters by search', async () => {
    const r = await api('GET', '/api/leads?q=Bandra');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.leads.length > 0, 'Expected search results');
    assert(r.body.leads.every(l =>
      l.name.includes('Bandra') || l.location.includes('Bandra') ||
      l.source.includes('Bandra') || l.phone.includes('Bandra')
    ), 'Non-matching lead in search results');
  });

  await test('GET /api/leads?page=1&limit=5 paginates correctly', async () => {
    const r = await api('GET', '/api/leads?page=1&limit=5');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.leads.length <= 5, `Expected ≤5 leads, got ${r.body.leads.length}`);
    assert(r.body.pagination.page === 1, 'Wrong page number');
    assert(r.body.pagination.limit === 5, 'Wrong limit');
    assert(r.body.pagination.total > 5, 'Total should be >5');
  });

  // ── T8: Lead Status Update ────────────────────
  console.log(B('\n  🔄  Test Group 7 — Lead Updates & Reassignment\n'));

  await test('PATCH /api/leads/:id updates status to contacted', async () => {
    const r = await api('PATCH', `/api/leads/${newLeadId}`, { status: 'contacted' });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.lead?.status === 'contacted', `Expected status=contacted, got ${r.body.lead?.status}`);
  });

  await test('POST /api/leads/:id/reassign moves to different executive', async () => {
    // Get all execs, find one different from current assignee
    const execsRes = await api('GET', '/api/executives');
    const leadRes  = await api('GET', `/api/leads/${newLeadId}`);
    const currentExecId = leadRes.body.assigned_to;

    const newExec = execsRes.body.executives.find(e => e.id !== currentExecId && e.active);
    assert(newExec, 'No other active executive found to reassign to');

    const r = await api('POST', `/api/leads/${newLeadId}/reassign`, {
      exec_id: newExec.id,
      reason:  'E2E test reassignment'
    });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.newExec?.id === newExec.id, 'Wrong exec after reassign');
  });

  await test('Reassignment creates history entry with action=reassigned', async () => {
    const r = await api('GET', `/api/leads/${newLeadId}/history`);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const reassigned = r.body.history.find(h => h.action === 'reassigned');
    assert(reassigned, 'No reassigned entry in history');
    assert(reassigned.reason === 'E2E test reassignment', 'Wrong reason in history');
  });

  await test('Cannot reassign to inactive executive', async () => {
    const r = await api('POST', `/api/leads/${newLeadId}/reassign`, {
      exec_id: inactiveExecId,
      reason:  'Should fail'
    });
    assert(r.status === 404, `Expected 404, got ${r.status}`);
    assert(r.body.error.includes('inactive'), `Expected "inactive" in error, got "${r.body.error}"`);
  });

  // ── T9: Inactive Exec Exclusion ───────────────
  console.log(B('\n  🚫  Test Group 8 — Inactive Executive Exclusion\n'));

  await test('New lead in Gurgaon assigns to ACTIVE exec only (not Deepika Rao)', async () => {
    const r = await api('POST', '/api/leads', {
      name:          'Gurgaon Test Lead',
      phone:         '+91 80000 99999',
      source:        'Referral',
      location:      'Gurgaon',
      budget:        '₹1Cr–₹2Cr',
      property_type: '3BHK Apartment',
      temperature:   'hot'
    });
    assert([201, 207].includes(r.status), `Expected 201/207, got ${r.status}`);
    if (r.body.lead?.assigned_to) {
      assert(
        r.body.lead.assigned_to !== inactiveExecId,
        'FAIL: Lead was assigned to INACTIVE exec Deepika Rao!'
      );
    }
  });

  // ── T10: Redistribute ─────────────────────────
  console.log(B('\n  🔁  Test Group 9 — Redistribute Unassigned Leads\n'));

  await test('POST /api/executives/redistribute returns result summary', async () => {
    const r = await api('POST', '/api/executives/redistribute');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.attempted !== undefined, 'Missing attempted count');
    assert(r.body.assigned  !== undefined, 'Missing assigned count');
    assert(r.body.stillUnassigned !== undefined, 'Missing stillUnassigned count');
  });

  // ── Final Summary ─────────────────────────────
  console.log('');
  console.log(W('  ══════════════════════════════════════════'));
  console.log(W('  📊  E2E TEST RESULTS'));
  console.log(W('  ══════════════════════════════════════════'));
  console.log(`     ${G('Passed')}  : ${G(passed)}`);
  console.log(`     ${R('Failed')}  : ${failed > 0 ? R(failed) : G(failed)}`);
  console.log(`     Total   : ${passed + failed}`);
  console.log(`     Score   : ${Math.round(passed / (passed + failed) * 100)}%`);
  console.log(W('  ══════════════════════════════════════════'));
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error(R('\n  ❌  Test runner crashed:'), err.message);
  process.exit(1);
});
