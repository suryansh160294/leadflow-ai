// Quick Node.js test for the assignment engine
const fs = require('fs');

// ── Load data ──
const code = fs.readFileSync('./data.js', 'utf8')
  .replace(/const /g, 'var ');   // convert const → var so eval hoists correctly
eval(code);

// ── Assignment engine (mirrors app.js) ──
function assignLead(lead, execs) {
  const eligible = execs.filter(exec => {
    if (!exec.active) return false;
    if (!exec.locations.includes(lead.location)) return false;
    if (exec.currentLeads >= exec.maxDailyCapacity) return false;
    return true;
  });
  if (eligible.length === 0) {
    lead.status = 'unassigned';
    lead.assignedTo = null;
    lead.reason = 'No eligible executive (location/capacity/inactive)';
    return;
  }
  eligible.sort((a, b) => a.currentLeads - b.currentLeads);
  const chosen = eligible[0];
  chosen.currentLeads++;
  lead.assignedTo  = chosen.name;
  lead.assignedId  = chosen.id;
  lead.status      = 'assigned';
  lead.reason      = `Matched "${lead.location}", exec load: ${chosen.currentLeads}/${chosen.maxDailyCapacity}`;
}

// ── Run simulation ──
const execs = JSON.parse(JSON.stringify(EXECUTIVES));
const results = SEED_LEADS.map(l => {
  const lead = { ...l, status: 'unassigned', assignedTo: null, reason: '' };
  assignLead(lead, execs);
  return lead;
});

// ── Print Results ──
const W = '='.repeat(72);
console.log('\n' + W);
console.log('  LeadFlow AI — Assignment Engine Test Results');
console.log(W);
console.log(`  Total leads   : ${results.length}`);
console.log(`  ✓ Assigned    : ${results.filter(l => l.status === 'assigned').length}`);
console.log(`  ✗ Unassigned  : ${results.filter(l => l.status === 'unassigned').length}`);
console.log(W);

console.log('\n  PER-LEAD BREAKDOWN:\n');
results.forEach(l => {
  const icon = l.status === 'assigned' ? '✓' : '✗';
  const temp = l.temperature === 'hot' ? '🔥' : l.temperature === 'warm' ? '☀' : '❄';
  const name = l.name.padEnd(24);
  const loc  = l.location.padEnd(16);
  const who  = l.assignedTo ? l.assignedTo : '(unassigned)';
  console.log(`  ${icon} ${temp} ${name} ${loc} → ${who}`);
  console.log(`      Reason: ${l.reason}`);
});

console.log('\n' + W);
console.log('  EXECUTIVE LOAD SUMMARY:\n');
execs.forEach(e => {
  const status = e.active ? '[ACTIVE]  ' : '[INACTIVE]';
  const filled = '█'.repeat(e.currentLeads);
  const empty  = '░'.repeat(Math.max(0, e.maxDailyCapacity - e.currentLeads));
  const bar    = filled + empty;
  const pct    = e.maxDailyCapacity > 0 ? Math.round(e.currentLeads / e.maxDailyCapacity * 100) : 0;
  console.log(`  ${status} ${e.name.padEnd(18)} ${bar} ${e.currentLeads}/${e.maxDailyCapacity} (${pct}%)`);
});
console.log('\n' + W + '\n');
