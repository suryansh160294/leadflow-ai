// =============================================
//  src/config/seed.js
//  Seeds all 10 executives from data.js into DB
//  Run with: node src/config/seed.js
// =============================================

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const bcrypt   = require('bcryptjs');
const { pool, query } = require('./db');

// ── All 10 executives from data.js ────────────
const EXECUTIVES = [
  {
    name: 'Priya Sharma',
    phone: '+91 98201 11001',
    whatsapp_number: '+91 98201 11001',
    email: 'priya.sharma@leadflow.ai',
    active: true,
    locations: ['Bandra', 'Andheri', 'Powai'],
    max_daily_capacity: 8,
    expertise: ['Luxury', '3BHK+', 'Resale'],
    success_rate: 74
  },
  {
    name: 'Rahul Mehta',
    phone: '+91 98201 11002',
    whatsapp_number: '+91 98201 11002',
    email: 'rahul.mehta@leadflow.ai',
    active: true,
    locations: ['Thane', 'Navi Mumbai', 'Powai'],
    max_daily_capacity: 6,
    expertise: ['Mid-segment', '2BHK', 'New Launch'],
    success_rate: 68
  },
  {
    name: 'Sunita Nair',
    phone: '+91 98201 11003',
    whatsapp_number: '+91 98201 11003',
    email: 'sunita.nair@leadflow.ai',
    active: true,
    locations: ['Pune', 'Bandra'],
    max_daily_capacity: 5,
    expertise: ['Premium', 'Villa', 'Penthouse'],
    success_rate: 81
  },
  {
    name: 'Arjun Kapoor',
    phone: '+91 98201 11004',
    whatsapp_number: '+91 98201 11004',
    email: 'arjun.kapoor@leadflow.ai',
    active: true,
    locations: ['Whitefield', 'Electronic City', 'HSR Layout'],
    max_daily_capacity: 7,
    expertise: ['IT Corridor', 'Affordable', '1BHK'],
    success_rate: 65
  },
  {
    name: 'Deepika Rao',
    phone: '+91 98201 11005',
    whatsapp_number: '+91 98201 11005',
    email: 'deepika.rao@leadflow.ai',
    active: false,  // ← INACTIVE (for testing exclusion)
    locations: ['Gurgaon', 'Bandra', 'Andheri'],
    max_daily_capacity: 6,
    expertise: ['Corporate', 'NRI Clients'],
    success_rate: 70
  },
  {
    name: 'Vikram Singh',
    phone: '+91 98201 11006',
    whatsapp_number: '+91 98201 11006',
    email: 'vikram.singh@leadflow.ai',
    active: true,
    locations: ['Gurgaon', 'Andheri'],
    max_daily_capacity: 4,
    expertise: ['Commercial', 'Plots'],
    success_rate: 59
  },
  {
    name: 'Meera Pillai',
    phone: '+91 98201 11007',
    whatsapp_number: '+91 98201 11007',
    email: 'meera.pillai@leadflow.ai',
    active: true,
    locations: ['Powai', 'Thane', 'Navi Mumbai', 'Pune'],
    max_daily_capacity: 9,
    expertise: ['Family Homes', '3BHK', 'Integrated Townships'],
    success_rate: 77
  },
  {
    name: 'Aditya Joshi',
    phone: '+91 98201 11008',
    whatsapp_number: '+91 98201 11008',
    email: 'aditya.joshi@leadflow.ai',
    active: true,
    locations: ['HSR Layout', 'Electronic City', 'Whitefield', 'Gurgaon'],
    max_daily_capacity: 6,
    expertise: ['Tech Parks', 'Startup Corridor', '2BHK'],
    success_rate: 63
  },
  {
    name: 'Kavya Reddy',
    phone: '+91 98201 11009',
    whatsapp_number: '+91 98201 11009',
    email: 'kavya.reddy@leadflow.ai',
    active: true,
    locations: ['Bandra', 'Pune', 'HSR Layout'],
    max_daily_capacity: 7,
    expertise: ['Luxury', '4BHK+', 'Penthouse', 'NRI'],
    success_rate: 85
  },
  {
    name: 'Sandeep Kulkarni',
    phone: '+91 98201 11010',
    whatsapp_number: '+91 98201 11010',
    email: 'sandeep.k@leadflow.ai',
    active: true,
    locations: ['Andheri', 'Thane', 'Navi Mumbai'],
    max_daily_capacity: 8,
    expertise: ['First-time Buyers', 'Affordable', '1BHK', '2BHK'],
    success_rate: 71
  }
];

// ── Seed leads (from data.js) ─────────────────
const SEED_LEADS = [
  { name: 'Ananya Krishnan',     phone: '+91 99001 00101', source: '99acres',      location: 'Bandra',         budget: '₹1Cr–₹2Cr',  property_type: '3BHK Apartment',   temperature: 'hot'  },
  { name: 'Suresh Patel',        phone: '+91 99001 00102', source: 'MagicBricks',  location: 'Thane',          budget: '₹60L–₹1Cr',  property_type: '2BHK Apartment',   temperature: 'warm' },
  { name: 'Rekha Iyer',          phone: '+91 99001 00103', source: 'Google Ads',   location: 'Whitefield',     budget: '> ₹2Cr',     property_type: 'Villa',            temperature: 'hot'  },
  { name: 'Manish Gupta',        phone: '+91 99001 00104', source: 'Facebook Ads', location: 'Powai',          budget: '₹30L–₹60L',  property_type: '1BHK Apartment',   temperature: 'cold' },
  { name: 'Lakshmi Reddy',       phone: '+91 99001 00105', source: 'Referral',     location: 'Gurgaon',        budget: '₹1Cr–₹2Cr',  property_type: '3BHK Apartment',   temperature: 'hot'  },
  { name: 'Karthik Subramanian', phone: '+91 99001 00106', source: 'Housing.com',  location: 'HSR Layout',     budget: '₹60L–₹1Cr',  property_type: '2BHK Apartment',   temperature: 'warm' },
  { name: 'Pooja Malhotra',      phone: '+91 99001 00107', source: 'Instagram',    location: 'Andheri',        budget: '< ₹30L',     property_type: '1BHK Apartment',   temperature: 'cold' },
  { name: 'Nikhil Bose',         phone: '+91 99001 00108', source: 'NoBroker',     location: 'Electronic City',budget: '₹30L–₹60L',  property_type: '2BHK Apartment',   temperature: 'warm' },
  { name: 'Divya Nambiar',       phone: '+91 99001 00109', source: 'Walk-in',      location: 'Pune',           budget: '> ₹2Cr',     property_type: 'Penthouse',        temperature: 'hot'  },
  { name: 'Rohit Saxena',        phone: '+91 99001 00110', source: '99acres',      location: 'Navi Mumbai',    budget: '₹60L–₹1Cr',  property_type: '3BHK Apartment',   temperature: 'warm' },
  { name: 'Nisha Agarwal',       phone: '+91 99001 00111', source: 'MagicBricks',  location: 'Bandra',         budget: '> ₹2Cr',     property_type: '4BHK+ Apartment',  temperature: 'hot'  },
  { name: 'Sanjay Verma',        phone: '+91 99001 00112', source: 'Facebook Ads', location: 'Gurgaon',        budget: '₹1Cr–₹2Cr',  property_type: 'Villa',            temperature: 'warm' },
  { name: 'Kavitha Menon',       phone: '+91 99001 00113', source: 'Google Ads',   location: 'Andheri',        budget: '₹30L–₹60L',  property_type: '2BHK Apartment',   temperature: 'cold' },
  { name: 'Ashwin Tiwari',       phone: '+91 99001 00114', source: 'Referral',     location: 'Powai',          budget: '₹60L–₹1Cr',  property_type: '3BHK Apartment',   temperature: 'hot'  },
  { name: 'Geeta Chandra',       phone: '+91 99001 00115', source: 'Housing.com',  location: 'Pune',           budget: '< ₹30L',     property_type: '1BHK Apartment',   temperature: 'cold' },
  { name: 'Farhan Sheikh',       phone: '+91 99001 00116', source: 'Instagram',    location: 'Thane',          budget: '> ₹2Cr',     property_type: 'Commercial',       temperature: 'hot'  },
  { name: 'Riya Desai',          phone: '+91 99001 00117', source: 'Referral',     location: 'Bandra',         budget: '> ₹2Cr',     property_type: 'Penthouse',        temperature: 'hot'  },
  { name: 'Mohit Bansal',        phone: '+91 99001 00118', source: 'NoBroker',     location: 'HSR Layout',     budget: '₹30L–₹60L',  property_type: '1BHK Apartment',   temperature: 'cold' },
  { name: 'Sneha Iyer',          phone: '+91 99001 00119', source: 'Walk-in',      location: 'Electronic City',budget: '₹60L–₹1Cr',  property_type: '2BHK Apartment',   temperature: 'warm' },
  { name: 'Tarun Mishra',        phone: '+91 99001 00120', source: '99acres',      location: 'Gurgaon',        budget: '₹1Cr–₹2Cr',  property_type: '3BHK Apartment',   temperature: 'warm' },
  { name: 'Preethi Nair',        phone: '+91 99001 00121', source: 'MagicBricks',  location: 'Whitefield',     budget: '₹60L–₹1Cr',  property_type: '2BHK Apartment',   temperature: 'warm' },
  { name: 'Abhishek Roy',        phone: '+91 99001 00122', source: 'Google Ads',   location: 'Navi Mumbai',    budget: '< ₹30L',     property_type: '1BHK Apartment',   temperature: 'cold' }
];

// ── Main seed function ─────────────────────────
async function seed() {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║      LeadFlow AI — DB Seeder         ║');
  console.log('  ╚══════════════════════════════════════╝\n');

  try {
    // 1. Get tenant ID
    const { rows: tenantRows } = await query(
      "SELECT id FROM tenants WHERE slug = 'demo-agency' LIMIT 1"
    );
    if (tenantRows.length === 0) {
      console.error('  ❌  Demo tenant not found. Run migration first.');
      process.exit(1);
    }
    const tenantId = tenantRows[0].id;
    console.log(`  ✅  Tenant found: ${tenantId}\n`);

    // 2. Clear existing data (fresh seed)
    await query('DELETE FROM assignment_history WHERE tenant_id = $1', [tenantId]);
    await query('DELETE FROM daily_counters    WHERE tenant_id = $1', [tenantId]);
    await query('DELETE FROM round_robin_state WHERE tenant_id = $1', [tenantId]);
    await query('DELETE FROM leads             WHERE tenant_id = $1', [tenantId]);
    await query("DELETE FROM users             WHERE tenant_id = $1 AND role = 'executive'", [tenantId]);
    console.log('  🗑️   Cleared existing seed data\n');

    // 3. Seed executives
    console.log('  👤  Seeding executives...');
    const passwordHash = await bcrypt.hash('exec@123', 12); // default password
    const execIds = {};

    for (const exec of EXECUTIVES) {
      const { rows } = await query(
        `INSERT INTO users (
           tenant_id, name, email, phone, whatsapp_number, password_hash,
           role, active, locations, expertise, max_daily_capacity, success_rate
         ) VALUES ($1,$2,$3,$4,$5,$6,'executive',$7,$8,$9,$10,$11)
         RETURNING id, name, active`,
        [
          tenantId, exec.name, exec.email, exec.phone,
          exec.whatsapp_number, passwordHash,
          exec.active, exec.locations, exec.expertise,
          exec.max_daily_capacity, exec.success_rate
        ]
      );
      execIds[exec.name] = rows[0].id;
      const status = exec.active ? '🟢 Active' : '🔴 Inactive';
      console.log(`     ${status}  ${exec.name.padEnd(22)} → locations: [${exec.locations.join(', ')}]`);
    }

    // 4. Seed leads with auto-assignment
    console.log('\n  📋  Seeding leads with auto-assignment...\n');
    const { calcScore } = require('../services/assignment.service');

    // Re-require assignment service (needs real DB)
    const assignmentService = require('../services/assignment.service');

    // Get settings
    const { rows: tenantSettingRows } = await query(
      'SELECT settings FROM tenants WHERE id = $1', [tenantId]
    );
    const settings = tenantSettingRows[0]?.settings || { distributionMode: 'smart' };

    let assignedCount = 0;
    let unassignedCount = 0;

    for (const leadData of SEED_LEADS) {
      const score = calcScore({ ...leadData });

      // Insert lead
      const { rows: leadRows } = await query(
        `INSERT INTO leads (
           tenant_id, name, phone, source, location,
           budget, property_type, temperature, priority_score
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          tenantId, leadData.name, leadData.phone,
          leadData.source, leadData.location, leadData.budget,
          leadData.property_type, leadData.temperature, score.total
        ]
      );
      const lead = leadRows[0];

      // Auto-assign
      const result = await assignmentService.assignLead(lead, tenantId, settings);

      if (result.status === 'assigned') {
        assignedCount++;
        console.log(`     ✅  ${leadData.name.padEnd(22)} → Score: ${score.total.toString().padStart(3)} | ${result.assignedTo}`);
      } else {
        unassignedCount++;
        console.log(`     ⚠️   ${leadData.name.padEnd(22)} → Score: ${score.total.toString().padStart(3)} | UNASSIGNED`);
      }
    }

    // 5. Print summary
    console.log('\n  ─────────────────────────────────────────');
    console.log(`  📊  SEED COMPLETE`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`     Executives  : ${EXECUTIVES.length} (${EXECUTIVES.filter(e=>e.active).length} active, ${EXECUTIVES.filter(e=>!e.active).length} inactive)`);
    console.log(`     Leads total : ${SEED_LEADS.length}`);
    console.log(`     Assigned    : ${assignedCount} ✅`);
    console.log(`     Unassigned  : ${unassignedCount} ⚠️`);
    console.log(`     Default pwd : exec@123`);
    console.log('  ─────────────────────────────────────────\n');

    // 6. Print final exec load
    const today = new Date().toISOString().split('T')[0];
    const { rows: loadRows } = await query(
      `SELECT u.name, COALESCE(dc.count,0) as today, u.max_daily_capacity, u.active
       FROM   users u
       LEFT JOIN daily_counters dc ON dc.user_id = u.id AND dc.date = $1
       WHERE  u.tenant_id = $2 AND u.role = 'executive'
       ORDER BY COALESCE(dc.count,0) DESC`,
      [today, tenantId]
    );

    console.log('  📈  Executive Load After Seeding:');
    loadRows.forEach(r => {
      const bar  = '█'.repeat(r.today) + '░'.repeat(Math.max(0, r.max_daily_capacity - r.today));
      const pct  = Math.round(r.today / r.max_daily_capacity * 100);
      const flag = r.active ? '' : ' [INACTIVE]';
      console.log(`     ${r.name.padEnd(22)} ${bar.slice(0,10)} ${r.today}/${r.max_daily_capacity} (${pct}%)${flag}`);
    });

    console.log('\n  🚀  Ready! Start the server with: npm run dev\n');

  } catch (err) {
    console.error('\n  ❌  Seed failed:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

seed();
