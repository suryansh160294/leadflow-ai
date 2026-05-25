// =============================================
//  app.js — LeadFlow AI v2 Application Engine
//  API-Connected Version (Node.js + PostgreSQL)
// =============================================

'use strict';

const API_BASE = 'http://localhost:3000/api';
let token = localStorage.getItem('token') || null;
let refreshToken = localStorage.getItem('refreshToken') || null;
let currentUser = null;

let executives = [];
let leads = [];
let APP_SETTINGS = {
  distributionMode: 'smart',
  allowDuplicates: true,
  autoReassignOnCapacity: false
};

let pendingDupSubmit = null;   // holds form data during dup warning
let activeReassignId = null;   // lead being reassigned

const SOURCE_COLORS = [
  '#7c6dff','#34d399','#fbbf24','#f87171',
  '#38b2ff','#c49bff','#ffaa3b','#81c784',
  '#ff6b9d','#00c9a7'
];

// =============================================
//  API CLIENT WRAPPER
// =============================================

async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  };

  let res = await fetch(`${API_BASE}${path}`, options);
  
  if (res.status === 401 && token && path !== '/auth/login') {
    // Attempt token refresh
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken || '' })
      });
      
      if (refreshRes.status === 200) {
        const refreshData = await refreshRes.json();
        token = refreshData.accessToken;
        refreshToken = refreshData.refreshToken;
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        
        // Retry the original request
        options.headers['Authorization'] = `Bearer ${token}`;
        res = await fetch(`${API_BASE}${path}`, options);
      } else {
        handleLogout();
        throw new Error('Session expired. Please log in again.');
      }
    } catch (err) {
      handleLogout();
      throw err;
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw { status: res.status, message: json.error || 'Request failed', body: json };
  }
  return json;
}

// ─────────────────────────────────────────────
//  MAPPING UTILITIES (Database to Frontend Model)
// ─────────────────────────────────────────────

function mapLead(l) {
  return {
    id:           l.id,
    name:         l.name,
    phone:        l.phone,
    source:       l.source,
    location:     l.location,
    budget:       l.budget,
    propertyType: l.property_type,
    temperature:  l.temperature,
    score:        parseInt(l.priority_score) || 0,
    timestamp:    new Date(l.created_at),
    assignedTo:   l.assigned_exec_name || null,
    assignedExecId: l.assigned_to || null,
    status:       l.status,
    assignmentReason: l.assignment_reason || '',
    isDuplicate:  l.is_duplicate || false,
    history:      (l.history || []).map(h => ({
      action:    h.action,
      from:      h.from_user_name || null,
      to:        h.to_user_name || null,
      reason:    h.reason,
      timestamp: new Date(h.created_at)
    }))
  };
}

function mapExecutive(e) {
  const index = e.email.charCodeAt(0) + e.email.charCodeAt(e.email.length - 1);
  const avatarClass = `av-${index % 10}`;
  return {
    id:               e.id,
    name:             e.name,
    phone:            e.phone || '',
    email:            e.email,
    active:           e.active,
    locations:        e.locations || [],
    maxDailyCapacity: parseInt(e.max_daily_capacity) || 10,
    currentLeads:     parseInt(e.today_count) || 0,
    totalAllTime:     parseInt(e.total_assigned) || 0,
    successRate:      parseInt(e.success_rate) || 70,
    expertise:        e.expertise || [],
    avatarClass
  };
}

// =============================================
//  1. PRIORITY SCORING ENGINE (Preview Only)
// =============================================

function calcScore(lead) {
  const tempScore   = { hot: 40, warm: 25, cold: 10 };
  const budgetScore = { '> ₹2Cr': 30, '₹1Cr–₹2Cr': 24, '₹60L–₹1Cr': 18, '₹30L–₹60L': 12, '< ₹30L': 6 };
  const sourceScore = {
    'Referral': 20, 'Walk-in': 18, 'MagicBricks': 14, '99acres': 14,
    'Housing.com': 12, 'Google Ads': 10, 'NoBroker': 9,
    'Facebook Ads': 8, 'Instagram': 7
  };
  const propScore = {
    'Villa': 10, 'Penthouse': 10, '4BHK+ Apartment': 8,
    'Commercial': 7, '3BHK Apartment': 5, '2BHK Apartment': 4,
    'Plot': 4, '1BHK Apartment': 3
  };

  const t = tempScore[lead.temperature]    || 0;
  const b = budgetScore[lead.budget]       || 0;
  const s = sourceScore[lead.source]       || 0;
  const p = propScore[lead.propertyType]   || 0;

  return { total: Math.min(100, t + b + s + p), t, b, s, p };
}

// =============================================
//  2. AUTH FLOW & LOGIN
// =============================================

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiCall('POST', '/auth/login', { email, password });
    token = data.accessToken;
    refreshToken = data.refreshToken;
    currentUser = data.user;

    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);

    document.getElementById('login-overlay').classList.add('hidden');
    document.body.classList.remove('logged-out');

    showToast('🔑 Welcome Back', `Logged in as ${currentUser.name}`, '#34d399');
    
    // Set UI roles and load
    applyRoleRestrictions();
    await loadInitialData();
  } catch (err) {
    showToast('❌ Login Failed', err.message || 'Invalid email or password', '#f87171');
  }
}

async function handleLogout() {
  try {
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ refreshToken: refreshToken || '' })
      });
    }
  } catch (err) {
    console.error('Logout error:', err);
  }

  token = null;
  refreshToken = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');

  document.getElementById('login-overlay').classList.remove('hidden');
  document.body.classList.add('logged-out');
}

function applyRoleRestrictions() {
  if (!currentUser) return;

  // Show/Hide Admin Sidebar navigation link
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) {
    adminNav.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
  }

  // Update Topbar Profile Pill
  document.getElementById('topbar-user-name').textContent = currentUser.name;
  document.getElementById('topbar-user-role').textContent = currentUser.role;

  // Smart Mode Toggle restriction
  const redistributeBtn = document.getElementById('btn-redistribute');
  if (redistributeBtn) {
    redistributeBtn.style.display = currentUser.role === 'admin' ? 'block' : 'none';
  }
}

// =============================================
//  3. LOAD INITIAL DATA
// =============================================

async function loadInitialData() {
  if (!token) return;

  try {
    // 1. Get current tenant settings
    const profile = await apiCall('GET', '/auth/me');
    currentUser = profile;
    
    if (profile.tenantSettings) {
      APP_SETTINGS.distributionMode = profile.tenantSettings.distributionMode || 'smart';
      setDistributionModeUI(APP_SETTINGS.distributionMode);
    }

    // 2. Fetch executives
    const execRes = await apiCall('GET', '/executives');
    executives = execRes.executives.map(mapExecutive);

    // 3. Fetch leads (retrieve last 100 for local rendering and client filters)
    await fetchLeads();

    renderAll();
  } catch (err) {
    console.error('Error loading initial data:', err);
    showToast('❌ Data Load Failed', 'Could not sync dashboard data from database.', '#f87171');
  }
}

async function fetchLeads() {
  try {
    const tf  = document.getElementById('filter-temp')?.value   || '';
    const sf  = document.getElementById('filter-status')?.value || '';
    const srcF= document.getElementById('filter-source')?.value || '';
    const exF = document.getElementById('filter-exec')?.value   || '';
    const q   = document.getElementById('search-leads')?.value   || '';

    const queryParams = new URLSearchParams();
    queryParams.append('limit', '100');
    if (tf) queryParams.append('temperature', tf);
    if (sf) queryParams.append('status', sf);
    if (srcF) queryParams.append('source', srcF);
    if (exF) queryParams.append('exec_id', exF);
    if (q) queryParams.append('q', q);

    const data = await apiCall('GET', `/leads?${queryParams.toString()}`);
    leads = data.leads.map(mapLead);
  } catch (err) {
    console.error('Error fetching leads:', err);
  }
}

// =============================================
//  4. LEAD CREATION / FINALIZATION
// =============================================

async function finalizeLead(data, force = false) {
  try {
    const payload = {
      name:          data.name,
      phone:         data.phone,
      source:        data.source,
      location:      data.location,
      budget:        data.budget,
      property_type: data.propertyType,
      temperature:   data.temperature,
      force:         force
    };

    const res = await apiCall('POST', '/leads', payload);
    const lead = mapLead(res.lead);

    // Reload all DB state
    await loadInitialData();

    // Show assignment outcome modal
    showResultModal(lead);
    clearForm();
  } catch (err) {
    if (err.status === 409) {
      showDupWarning(err.body, data);
    } else {
      showToast('❌ Submission Failed', err.message || 'Could not submit lead.', '#f87171');
    }
  }
}

// =============================================
//  5. REASSIGNMENT
// =============================================

function openReassignModal(leadId) {
  activeReassignId = leadId;
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('reassign-lead-name').textContent = lead.name + ' · ' + lead.location;

  const sel = document.getElementById('reassign-exec-select');
  const allActive = executives.filter(e => e.active);

  sel.innerHTML = allActive.map(e => {
    const atCap = e.currentLeads >= e.maxDailyCapacity;
    const isCurrent = e.id === lead.assignedExecId;
    const isEligible = e.locations.includes(lead.location);
    return `<option value="${e.id}" ${isCurrent ? 'selected' : ''} ${atCap && !isCurrent ? 'disabled' : ''}>
      ${e.name} (${e.currentLeads}/${e.maxDailyCapacity})${atCap ? ' – At capacity' : ''}${isEligible ? ' ✓' : ''}
    </option>`;
  }).join('');

  document.getElementById('reassign-reason').value = '';
  document.getElementById('reassign-overlay').classList.add('show');
}

function closeReassignModal() {
  document.getElementById('reassign-overlay').classList.remove('show');
  activeReassignId = null;
}

async function confirmReassign() {
  const lead = leads.find(l => l.id === activeReassignId);
  if (!lead) return;

  const newExecId = document.getElementById('reassign-exec-select').value;
  const reason    = document.getElementById('reassign-reason').value.trim() || 'Manual reassignment';
  const newExec   = executives.find(e => e.id === newExecId);
  if (!newExec) return;

  try {
    await apiCall('POST', `/leads/${lead.id}/reassign`, {
      exec_id: newExecId,
      reason
    });

    closeReassignModal();
    await loadInitialData();
    showToast('🔄 Lead Reassigned', `${lead.name} → ${newExec.name}`, '#ffaa3b');
  } catch (err) {
    showToast('❌ Reassign Failed', err.message || 'Could not reassign lead.', '#f87171');
  }
}

// =============================================
//  6. REDISTRIBUTE ALL
// =============================================

async function redistributeAll() {
  try {
    const res = await apiCall('POST', '/executives/redistribute');
    await loadInitialData();
    showToast(
      '🔄 Re-distribution Complete',
      res.assigned > 0 ? `${res.assigned} lead(s) newly assigned.` : 'No new assignments could be made.',
      res.assigned > 0 ? '#34d399' : '#ffaa3b'
    );
  } catch (err) {
    showToast('❌ Redistribution Failed', err.message || 'Could not redistribute leads.', '#f87171');
  }
}

// =============================================
//  7. FORM SUBMISSION
// =============================================

function submitLead(e) {
  e.preventDefault();
  const tempVal = document.querySelector('input[name="f-temp"]:checked');
  if (!tempVal) { showToast('⚠️ Missing field', 'Please select a lead temperature.', '#f87171'); return; }

  const data = {
    name:         document.getElementById('f-name').value.trim(),
    phone:        document.getElementById('f-phone').value.trim(),
    source:       document.getElementById('f-source').value,
    location:     document.getElementById('f-location').value,
    budget:       document.getElementById('f-budget').value,
    propertyType: document.getElementById('f-property').value,
    temperature:  tempVal.value
  };

  finalizeLead(data, false);
}

function showDupWarning(dup, data) {
  pendingDupSubmit = data;
  const existing = dup.existing;
  const matchType = dup.type === 'phone' ? '📞 Phone Match' : '👤 Name Match';

  document.getElementById('dup-body').innerHTML = `
    <div class="modal-detail">
      <span class="modal-detail-lbl">Match Type</span>
      <span class="modal-detail-val">
        <span class="badge badge-dup">${matchType}</span>
      </span>
    </div>
    <div class="modal-detail">
      <span class="modal-detail-lbl">Existing Lead</span>
      <span class="modal-detail-val">${escHtml(existing.name)}</span>
    </div>
    <div class="modal-detail">
      <span class="modal-detail-lbl">Phone</span>
      <span class="modal-detail-val">${escHtml(existing.phone)}</span>
    </div>
    <div class="modal-detail">
      <span class="modal-detail-lbl">Added On</span>
      <span class="modal-detail-val">${formatDateTime(new Date(existing.created_at))}</span>
    </div>
    <div class="modal-detail">
      <span class="modal-detail-lbl">Assigned To</span>
      <span class="modal-detail-val">${existing.assigned_exec_name || '(Unassigned)'}</span>
    </div>
    <p style="margin-top:14px;font-size:12px;color:var(--text-2);">Submit anyway to create a new lead entry, or cancel to review.</p>
  `;

  document.getElementById('dup-override-btn').onclick = () => {
    closeDupModal();
    finalizeLead(pendingDupSubmit, true);
    pendingDupSubmit = null;
  };

  document.getElementById('dup-overlay').classList.add('show');
}

function closeDupModal() {
  document.getElementById('dup-overlay').classList.remove('show');
  pendingDupSubmit = null;
}

function showResultModal(lead) {
  const assigned = lead.status === 'assigned';

  document.getElementById('result-icon').textContent = assigned ? '✅' : '⚠️';
  document.getElementById('result-icon').style.background = assigned ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)';
  document.getElementById('result-title').textContent = assigned ? 'Lead Assigned!' : 'Lead Unassigned';
  document.getElementById('result-sub').textContent = assigned
    ? `Score ${lead.score} · Mapped via ${APP_SETTINGS.distributionMode === 'round-robin' ? 'Round-Robin' : 'Smart'} mode`
    : 'No eligible executive found';

  document.getElementById('result-body').innerHTML = `
    <div class="modal-detail">
      <span class="modal-detail-lbl">Lead Name</span>
      <span class="modal-detail-val">${escHtml(lead.name)}</span>
    </div>
    <div class="modal-detail">
      <span class="modal-detail-lbl">Priority Score</span>
      <span class="modal-detail-val">${scorePill(lead.score)}</span>
    </div>
    <div class="modal-detail">
      <span class="modal-detail-lbl">Temperature</span>
      <span class="modal-detail-val">${tempBadge(lead.temperature)}</span>
    </div>
    ${assigned ? `
    <div class="modal-detail">
      <span class="modal-detail-lbl">Assigned To</span>
      <span class="modal-detail-val" style="font-weight:700;color:var(--green)">${escHtml(lead.assignedTo)}</span>
    </div>` : ''}
    <div class="modal-detail">
      <span class="modal-detail-lbl">Reason</span>
      <span class="modal-detail-val" style="font-size:11.5px;color:var(--text-2)">${escHtml(lead.assignmentReason)}</span>
    </div>
  `;

  document.getElementById('result-overlay').classList.add('show');

  const msg = assigned ? `${lead.name} → ${lead.assignedTo}` : lead.assignmentReason;
  showToast(assigned ? '✅ Lead Assigned' : '⚠️ Unassigned', msg, assigned ? '#34d399' : '#ffaa3b');
}

function closeResultModal() { document.getElementById('result-overlay').classList.remove('show'); }

function clearForm() {
  document.getElementById('lead-form').reset();
  updateScorePreview();
}

// =============================================
//  8. LIVE SCORE PREVIEW
// =============================================

let scorePreviewRAF = null;
let lastScoreVal = 0;
let checkDupTimeout = null;

function updateScorePreview() {
  const tempVal = document.querySelector('input[name="f-temp"]:checked')?.value || '';
  const budget  = document.getElementById('f-budget')?.value || '';
  const source  = document.getElementById('f-source')?.value || '';
  const prop    = document.getElementById('f-property')?.value || '';
  const loc     = document.getElementById('f-location')?.value || '';
  const name    = document.getElementById('f-name')?.value.trim() || '';
  const phone   = document.getElementById('f-phone')?.value.trim() || '';

  const data = { temperature: tempVal, budget, source: source || '__none__', propertyType: prop, location: loc };
  const score = calcScore(data);

  // Asynchronous debounced duplicate detection
  const hint = document.getElementById('dup-hint');
  if (hint) {
    if (phone.length >= 7) {
      clearTimeout(checkDupTimeout);
      checkDupTimeout = setTimeout(async () => {
        try {
          const res = await apiCall('POST', '/leads/check-dup', { name, phone });
          if (res.isDuplicate) {
            hint.textContent = res.type === 'phone' ? '⚠ Phone number already exists' : '⚠ Name matches an existing lead';
            hint.style.cssText = 'color:var(--yellow);';
          } else {
            hint.textContent = '✓ No duplicates found';
            hint.style.cssText = 'color:var(--green);';
          }
        } catch (err) {
          console.error(err);
        }
      }, 400);
    } else {
      hint.textContent = '';
      hint.style.cssText = '';
    }
  }

  // Score breakdown
  const setBreak = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val > 0 ? val : '—'; };
  setBreak('sc-temp', score.t);
  setBreak('sc-budget', score.b);
  setBreak('sc-source', source ? score.s : 0);
  setBreak('sc-property', score.p);

  // Eligible executives preview
  const eligibleList = document.getElementById('eligible-list');
  if (eligibleList && loc) {
    const eligible = executives.filter(e => e.active && e.locations.includes(loc) && e.currentLeads < e.maxDailyCapacity);
    if (eligible.length === 0) {
      eligibleList.innerHTML = '<div style="font-size:12px;color:var(--red)">No eligible executives for this location</div>';
    } else {
      eligibleList.innerHTML = eligible.slice(0, 4).map(ex => `
        <div class="eligible-item">
          <div class="exec-av ${ex.avatarClass}" style="width:22px;height:22px;font-size:9px;flex-shrink:0;">${ex.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
          <span class="eligible-item-name">${escHtml(ex.name)}</span>
          <span class="eligible-item-load">${ex.currentLeads}/${ex.maxDailyCapacity}</span>
        </div>
      `).join('');
    }
  } else if (eligibleList) {
    eligibleList.innerHTML = '<div style="font-size:12px;color:var(--text-3)">Select a location to preview</div>';
  }

  // Animate ring
  const realData = { temperature: tempVal, budget, source, propertyType: prop };
  const realScore = calcScore(realData);
  animateScoreRing(realScore.total);
}

function animateScoreRing(targetScore) {
  const canvas = document.getElementById('score-preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 70, cy = 70, r = 54, lw = 10;
  let current = lastScoreVal;

  if (current === targetScore) {
    renderRingFrame(ctx, cx, cy, r, lw, current);
    return;
  }

  const step = (targetScore - current) / 18;
  if (scorePreviewRAF) cancelAnimationFrame(scorePreviewRAF);

  function draw() {
    current += step;
    if (step > 0 && current >= targetScore) current = targetScore;
    if (step < 0 && current <= targetScore) current = targetScore;

    renderRingFrame(ctx, cx, cy, r, lw, current);

    if (current !== targetScore) {
      scorePreviewRAF = requestAnimationFrame(draw);
    } else {
      lastScoreVal = targetScore;
      scorePreviewRAF = null;
    }
  }
  draw();
}

function renderRingFrame(ctx, cx, cy, r, lw, current) {
  ctx.clearRect(0, 0, 140, 140);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = lw;
  ctx.stroke();

  if (current > 0) {
    const angle = (current / 100) * Math.PI * 2 - Math.PI / 2;
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    const col = current >= 70 ? ['#34d399','#059669'] : current >= 40 ? ['#fbbf24','#d97706'] : ['#f87171','#dc2626'];
    grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, angle);
    ctx.strokeStyle = grad;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  const centerEl = document.getElementById('score-ring-center');
  if (centerEl) {
    const disp = Math.round(current);
    centerEl.textContent = disp > 0 ? disp : '—';
    centerEl.style.color = current >= 70 ? '#34d399' : current >= 40 ? '#fbbf24' : current > 0 ? '#f87171' : 'var(--text-3)';
  }
}

// =============================================
//  9. EXECUTIVE PANEL (SLIDE-OVER)
// =============================================

async function openExecPanel(execId) {
  if (currentUser.role === 'executive' && execId !== currentUser.id) {
    showToast('⚠️ Access Denied', 'Executives can only view their own profile.', '#f87171');
    return;
  }

  try {
    // Retrieve fresh data for this executive
    const execDetails = await apiCall('GET', `/executives/${execId}`);
    const execStats   = await apiCall('GET', `/executives/${execId}/stats`);

    const mappedExec  = mapExecutive(execDetails);
    const mappedLeads = (execDetails.leads || []).map(mapLead);

    const initials = mappedExec.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const pct = mappedExec.maxDailyCapacity > 0 ? Math.min(100, Math.round(mappedExec.currentLeads / mappedExec.maxDailyCapacity * 100)) : 0;
    const color = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--warm)' : 'var(--green)';

    document.getElementById('exec-panel-profile').innerHTML = `
      <div class="exec-av-lg ${mappedExec.avatarClass}" style="width:52px;height:52px;font-size:19px;">
        ${initials}
        <span class="status-ring ${mappedExec.active ? 'active' : 'inactive'}"></span>
      </div>
      <div>
        <div style="font-size:16px;font-weight:800;margin-bottom:2px;">${escHtml(mappedExec.name)}</div>
        <div style="font-size:12px;color:var(--text-2);">${escHtml(mappedExec.email)}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px;">${escHtml(mappedExec.phone)}</div>
      </div>
    `;

    document.getElementById('exec-panel-body').innerHTML = `
      <!-- Stats Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;">
        <div class="exec-mini-stat">
          <div class="exec-mini-stat-val" style="color:${color}">${mappedExec.currentLeads}</div>
          <div class="exec-mini-stat-lbl">Today</div>
        </div>
        <div class="exec-mini-stat">
          <div class="exec-mini-stat-val">${mappedExec.maxDailyCapacity}</div>
          <div class="exec-mini-stat-lbl">Capacity</div>
        </div>
        <div class="exec-mini-stat">
          <div class="exec-mini-stat-val" style="color:var(--green)">${mappedExec.successRate}%</div>
          <div class="exec-mini-stat-lbl">Success</div>
        </div>
      </div>

      <!-- Capacity Bar -->
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-bottom:6px;">
          <span>Daily Capacity</span>
          <span style="font-weight:700;color:${color}">${pct}% used</span>
        </div>
        <div class="exec-progress">
          <div class="exec-progress-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>

      <!-- Expertise Tags -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:8px;">Expertise</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${mappedExec.expertise.map(ex => `<span class="loc-tag" style="color:var(--accent-2);border-color:rgba(124,109,255,0.25);">${escHtml(ex)}</span>`).join('')}
        </div>
      </div>

      <!-- Location Coverage -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:8px;">Location Coverage</div>
        <div class="exec-locations">${mappedExec.locations.map(l => `<span class="loc-tag">${escHtml(l)}</span>`).join('')}</div>
      </div>

      <!-- Assigned Leads -->
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:8px;">
          Assigned Leads (${mappedLeads.length})
        </div>
        ${mappedLeads.length === 0
          ? '<div style="font-size:13px;color:var(--text-3);padding:20px 0;text-align:center;">No leads assigned yet</div>'
          : mappedLeads.map(l => `
            <div class="panel-lead-item">
              <div>
                <div class="panel-lead-name">${escHtml(l.name)}</div>
                <div class="panel-lead-sub">${escHtml(l.location)} · ${escHtml(l.budget)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${tempBadge(l.temperature)}
                ${scorePill(l.score)}
              </div>
            </div>
          `).join('')
        }
      </div>

      <!-- Assignment History for this exec -->
      ${mappedLeads.length > 0 ? `
      <div style="margin-top:24px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-3);margin-bottom:12px;">Recent Activity</div>
        <div class="history-timeline">
          ${mappedLeads.flatMap(l => (l.history || []).map(h => ({...h, leadName: l.name})))
            .sort((a,b) => b.timestamp - a.timestamp)
            .slice(0, 6)
            .map(h => historyItem(h)).join('')}
        </div>
      </div>` : ''}
    `;

    document.getElementById('exec-overlay').classList.add('show');
    document.getElementById('exec-panel').classList.add('open');
  } catch (err) {
    showToast('❌ Profile Load Failed', err.message || 'Could not fetch executive details.', '#f87171');
  }
}

function closeExecPanel() {
  document.getElementById('exec-overlay').classList.remove('show');
  document.getElementById('exec-panel').classList.remove('open');
}

function historyItem(h) {
  const icons = { assigned: '✅', reassigned: '🔄', unassigned: '⚠️' };
  const colors = { assigned: 'var(--green-bg)', reassigned: 'var(--yellow-bg)', unassigned: 'var(--red-bg)' };
  const icon = icons[h.action] || '📌';
  const col  = colors[h.action] || 'rgba(255,255,255,0.05)';

  return `
    <div class="history-item">
      <div class="history-dot" style="background:${col}">${icon}</div>
      <div class="history-content">
        <div class="history-action">${h.leadName ? escHtml(h.leadName) + ' — ' : ''}${capitalize(h.action)}</div>
        ${h.to   ? `<div class="history-detail">→ ${escHtml(h.to)}</div>` : ''}
        ${h.from ? `<div class="history-detail" style="color:var(--text-3)">From: ${escHtml(h.from)}</div>` : ''}
        ${h.reason ? `<div class="history-detail" style="font-size:11px;color:var(--text-3)">${escHtml(h.reason)}</div>` : ''}
        <div class="history-time">${formatDateTime(h.timestamp)}</div>
      </div>
    </div>
  `;
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

// =============================================
//  10. ADMIN PANEL
// =============================================

function renderAdminPanel() {
  const list = document.getElementById('admin-exec-list');
  if (!list) return;

  list.innerHTML = executives.map(exec => {
    const initials = exec.name.split(' ').map(w => w[0]).join('').slice(0,2);
    return `
      <div class="admin-exec-row">
        <div class="exec-av ${exec.avatarClass}" style="width:32px;height:32px;font-size:11px;flex-shrink:0;">${initials}</div>
        <div class="admin-exec-name">${escHtml(exec.name)}</div>
        <div class="admin-exec-loc">${exec.locations.slice(0,2).join(', ')}${exec.locations.length > 2 ? '…' : ''}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-3);">
          Cap:
          <input type="number" class="capacity-input" value="${exec.maxDailyCapacity}" min="1" max="30"
            onchange="updateExecCapacity('${exec.id}', this.value)" />
        </div>
        <label class="toggle-switch" title="${exec.active ? 'Click to deactivate' : 'Click to activate'}">
          <input type="checkbox" ${exec.active ? 'checked' : ''} onchange="toggleExecStatus('${exec.id}', this.checked)" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    `;
  }).join('');

  // System health stats (calculated locally from memory lists synced with DB)
  const total      = leads.length;
  const assigned   = leads.filter(l => l.status === 'assigned').length;
  const unassigned = leads.filter(l => l.status === 'unassigned').length;
  const activeExecs = executives.filter(e => e.active).length;
  const rate = total > 0 ? Math.round(assigned / total * 100) : 0;

  const health = document.getElementById('health-grid');
  if (!health) return;

  health.innerHTML = [
    { val: total,        lbl: 'Total Leads',   col: 'var(--accent-2)' },
    { val: `${rate}%`,   lbl: 'Assignment Rate',col: rate > 80 ? 'var(--green)' : rate > 50 ? 'var(--warm)' : 'var(--red)' },
    { val: activeExecs,  lbl: 'Active Execs',  col: 'var(--green)' },
    { val: unassigned,   lbl: 'Unassigned',    col: unassigned > 0 ? 'var(--red)' : 'var(--green)' },
  ].map(h => `
    <div class="health-item">
      <div class="health-item-val" style="color:${h.col}">${h.val}</div>
      <div class="health-item-lbl">${h.lbl}</div>
    </div>
  `).join('');
}

async function toggleExecStatus(execId, isActive) {
  const exec = executives.find(e => e.id === execId);
  if (!exec) return;

  try {
    await apiCall('PATCH', `/executives/${execId}`, { active: isActive });
    exec.active = isActive;
    renderAll();
    showToast(
      isActive ? '✅ Executive Activated' : '🔕 Executive Deactivated',
      `${exec.name} is now ${isActive ? 'active' : 'inactive'}`,
      isActive ? '#34d399' : '#ffaa3b'
    );
  } catch (err) {
    showToast('❌ Update Failed', err.message || 'Could not update status.', '#f87171');
    await loadInitialData(); // Rollback UI status
  }
}

async function updateExecCapacity(execId, val) {
  const exec = executives.find(e => e.id === execId);
  if (!exec) return;
  const cap = Math.max(1, parseInt(val) || 1);

  try {
    await apiCall('PATCH', `/executives/${execId}`, { max_daily_capacity: cap });
    exec.maxDailyCapacity = cap;
    renderAll();
  } catch (err) {
    showToast('❌ Update Failed', err.message || 'Could not update capacity.', '#f87171');
    await loadInitialData(); // Rollback UI values
  }
}

async function setDistributionMode(mode) {
  try {
    await apiCall('PATCH', '/auth/tenant/settings', { settings: { distributionMode: mode } });
    APP_SETTINGS.distributionMode = mode;
    setDistributionModeUI(mode);
    showToast('⚙️ Mode Changed', `Distribution set to: ${mode === 'smart' ? 'Smart (Lowest Load)' : 'Round-Robin'}`, 'var(--accent-2)');
  } catch (err) {
    showToast('❌ Update Failed', err.message || 'Could not update settings.', '#f87171');
  }
}

function setDistributionModeUI(mode) {
  const smartBtn = document.getElementById('btn-smart');
  const rrBtn = document.getElementById('btn-rr');
  const modeLabel = document.getElementById('mode-label');

  if (smartBtn) smartBtn.classList.toggle('active', mode === 'smart');
  if (rrBtn) rrBtn.classList.toggle('active', mode === 'round-robin');
  if (modeLabel) modeLabel.textContent = mode === 'smart' ? 'Smart Mode' : 'Round-Robin';
}

async function resetDailyCounters() {
  try {
    await apiCall('POST', '/executives/reset-counters');
    showToast('🔄 Counters Reset', 'Daily counters have been reset successfully.', '#38b2ff');
    await loadInitialData();
  } catch (err) {
    showToast('❌ Reset Failed', err.message || 'Could not reset counters.', '#f87171');
  }
}

// =============================================
//  11. RENDER FUNCTIONS
// =============================================

function renderAll() {
  renderStats();
  renderExecPerformance();
  renderRecentLeads();
  renderLeadsTable();
  renderExecGrid();
  renderAdminPanel();
  updateNavBadges();

  const analyticsVisible = document.getElementById('section-analytics')?.classList.contains('active');
  if (analyticsVisible) renderAnalytics();
  drawTrendChart();
  drawAssignmentDonut();
  drawTempDonut();
}

function updateNavBadges() {
  const total = leads.length;
  const active = executives.filter(e => e.active).length;
  const unassigned = leads.filter(l => l.status === 'unassigned').length;

  const set = (id, val, show) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    el.classList.toggle('visible', show);
  };

  set('nav-badge-dashboard', total, total > 0);
  set('nav-badge-leads', unassigned, unassigned > 0);
  set('nav-badge-executives', active, true);
}

function renderStats() {
  const total      = leads.length;
  const assigned   = leads.filter(l => l.status === 'assigned').length;
  const unassigned = leads.filter(l => l.status === 'unassigned').length;
  const hot  = leads.filter(l => l.temperature === 'hot').length;
  const warm = leads.filter(l => l.temperature === 'warm').length;
  const cold = leads.filter(l => l.temperature === 'cold').length;

  const stats = [
    { emoji:'📋', val: total,      lbl:'Total Leads',    sub: `${total > 0 ? Math.round(assigned/total*100) : 0}% assigned`, top:'var(--accent)' },
    { emoji:'✅', val: assigned,   lbl:'Assigned',        sub:'Distributed leads',    top:'var(--green)' },
    { emoji:'⚠️', val: unassigned, lbl:'Unassigned',      sub: unassigned > 0 ? 'Needs attention' : 'All clear 🎉', top:'var(--red)' },
    { emoji:'🔥', val: hot,        lbl:'Hot Leads',       sub:'Priority pipeline',    top:'var(--hot)' },
    { emoji:'☀️', val: warm,       lbl:'Warm Leads',      sub:'Nurture pipeline',     top:'var(--warm)' },
    { emoji:'❄️', val: cold,       lbl:'Cold Leads',      sub:'Long-term pipeline',   top:'var(--cold)' }
  ];

  document.getElementById('stats-grid').innerHTML = stats.map(s => `
    <div class="stat-card" style="--card-top:${s.top}">
      <span class="stat-emoji">${s.emoji}</span>
      <div class="stat-val" style="color:${s.top}">${s.val}</div>
      <div class="stat-lbl">${s.lbl}</div>
      <div class="stat-sub">${s.sub}</div>
    </div>
  `).join('');
}

function renderExecPerformance() {
  const el = document.getElementById('exec-perf-list');
  if (!el) return;
  const list = executives.filter(e => e.active);

  el.innerHTML = list.map(exec => {
    const initials = exec.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    const pct = exec.maxDailyCapacity > 0 ? Math.min(100, exec.currentLeads / exec.maxDailyCapacity * 100) : 0;
    const color = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--warm)' : 'var(--green)';
    return `
      <div class="exec-perf-item">
        <div class="exec-av ${exec.avatarClass}">${initials}</div>
        <div class="exec-perf-info">
          <div class="exec-perf-name">${escHtml(exec.name)}</div>
          <div class="cap-bar"><div class="cap-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
        <div class="exec-perf-count" style="color:${color}">${exec.currentLeads}/${exec.maxDailyCapacity}</div>
      </div>
    `;
  }).join('');
}

function renderRecentLeads() {
  const tbody = document.getElementById('recent-leads-body');
  if (!tbody) return;
  const recent = leads.slice(0, 8);

  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--text-3)">
      No leads yet — <a href="#" onclick="showSection('add-lead');return false;" style="color:var(--accent-2)">Add your first lead →</a>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(l => `
    <tr>
      <td><div class="td-lead-name">${escHtml(l.name)}</div></td>
      <td>${scorePill(l.score)}</td>
      <td>${tempBadge(l.temperature)}</td>
      <td style="color:var(--text-2)">${escHtml(l.location)}</td>
      <td style="font-size:12px;color:var(--text-2)">${escHtml(l.budget)}</td>
      <td style="font-weight:600;color:var(--text-1)">${l.assignedTo ? escHtml(l.assignedTo) : '<span style="color:var(--text-3)">—</span>'}</td>
      <td>${statusBadge(l.status)}</td>
      <td style="font-size:11px;color:var(--text-3);white-space:nowrap">${formatTime(l.timestamp)}</td>
    </tr>
  `).join('');
}

async function renderLeadsTable() {
  // Pull fresh list filtered by database queries
  await fetchLeads();

  // Re-populate dropdown lists dynamically
  populateFilterDropdowns();

  const tbody = document.getElementById('all-leads-body');
  if (!tbody) return;

  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-3)">No leads match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map((l, i) => {
    // Enforce role-based reassignment restriction in UI
    const reassignButtonHtml = currentUser.role === 'admin' 
      ? `<button class="tbl-btn" onclick="openReassignModal('${l.id}')">Reassign</button>`
      : '';

    return `
      <tr>
        <td style="color:var(--text-3);font-size:11px">${i+1}</td>
        <td>
          <div class="td-lead-name">${escHtml(l.name)}${l.isDuplicate ? ' <span class="badge badge-dup" style="font-size:9px">DUP</span>' : ''}</div>
          <div class="td-lead-phone">${escHtml(l.phone)}</div>
        </td>
        <td>${scorePill(l.score)}</td>
        <td>${tempBadge(l.temperature)}</td>
        <td style="font-size:12px">${escHtml(l.source)}</td>
        <td style="font-size:12px">${escHtml(l.location)}</td>
        <td style="font-size:12px">${escHtml(l.budget)}</td>
        <td style="font-size:11.5px;color:var(--text-2)">${escHtml(l.propertyType)}</td>
        <td style="font-weight:600;color:var(--text-1)">${l.assignedTo ? escHtml(l.assignedTo) : '<span style="color:var(--text-3)">—</span>'}</td>
        <td>${statusBadge(l.status)}</td>
        <td style="font-size:11px;color:var(--text-3);white-space:nowrap">${formatDateTime(l.timestamp)}</td>
        <td>
          <div style="display:flex;gap:5px;">
            ${reassignButtonHtml}
            <button class="tbl-btn" onclick="viewHistory('${l.id}')">History</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function populateFilterDropdowns() {
  const srcSel  = document.getElementById('filter-source');
  const execSel = document.getElementById('filter-exec');
  if (!srcSel || !execSel) return;

  const curSrc  = srcSel.value;
  const curExec = execSel.value;

  // Render sources dropdown dynamically
  const sources = ['99acres', 'MagicBricks', 'Housing.com', 'Facebook Ads', 'Google Ads', 'Referral', 'Walk-in', 'Instagram', 'NoBroker'];
  srcSel.innerHTML = '<option value="">All Sources</option>';
  sources.forEach(src => {
    const opt = document.createElement('option');
    opt.value = src; opt.textContent = src;
    if (src === curSrc) opt.selected = true;
    srcSel.appendChild(opt);
  });

  // Render exec dropdown dynamically
  execSel.innerHTML = '<option value="">All Executives</option>';
  executives.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.id; opt.textContent = ex.name;
    if (ex.id === curExec) opt.selected = true;
    execSel.appendChild(opt);
  });
}

// ── View History Modal ────────────────────────

async function viewHistory(leadId) {
  try {
    const lead = await apiCall('GET', `/leads/${leadId}`);
    const mapped = mapLead(lead);
    const hist = mapped.history || [];

    document.getElementById('result-icon').textContent = '📋';
    document.getElementById('result-icon').style.background = 'var(--accent-dim)';
    document.getElementById('result-title').textContent = 'Assignment History';
    document.getElementById('result-sub').textContent = `${mapped.name} · ${hist.length} event(s)`;

    document.getElementById('result-body').innerHTML = hist.length === 0
      ? '<p style="color:var(--text-3);text-align:center;padding:20px;">No history recorded.</p>'
      : `<div class="history-timeline">${hist.map(h => historyItem({...h, leadName: ''})).join('')}</div>`;

    document.getElementById('result-overlay').classList.add('show');
  } catch (err) {
    showToast('❌ History Load Failed', err.message || 'Could not fetch lead logs.', '#f87171');
  }
}

// ── Executive Cards ───────────────────────────

function renderExecGrid() {
  const grid = document.getElementById('exec-grid');
  if (!grid) return;

  grid.innerHTML = executives.map(exec => {
    const initials = exec.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    const pct = exec.maxDailyCapacity > 0 ? Math.min(100, Math.round(exec.currentLeads / exec.maxDailyCapacity * 100)) : 0;
    const color = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--warm)' : 'var(--green)';
    const pips = Array.from({length: 10}, (_, i) => `<div class="pip ${i < Math.round(exec.successRate / 10) ? 'filled' : ''}"></div>`).join('');

    return `
      <div class="exec-card ${exec.active ? '' : 'inactive'}" onclick="openExecPanel('${exec.id}')">
        <div class="exec-card-top">
          <div class="exec-av-lg ${exec.avatarClass}">
            ${initials}
            <span class="status-ring ${exec.active ? 'active' : 'inactive'}"></span>
          </div>
          <div class="exec-card-info">
            <div class="exec-card-name">${escHtml(exec.name)}</div>
            <div class="exec-card-role">${exec.expertise.slice(0,2).join(' · ')}</div>
            <span class="chip ${exec.active ? 'chip-green' : 'chip-ghost'}" style="font-size:10px;padding:2px 7px;">
              ${exec.active ? '● Active' : '○ Inactive'}
            </span>
          </div>
        </div>

        <div class="exec-stat-row">
          <div class="exec-mini-stat">
            <div class="exec-mini-stat-val" style="color:${color}">${exec.currentLeads}</div>
            <div class="exec-mini-stat-lbl">Today</div>
          </div>
          <div class="exec-mini-stat">
            <div class="exec-mini-stat-val">${exec.totalAllTime}</div>
            <div class="exec-mini-stat-lbl">Total</div>
          </div>
          <div class="exec-mini-stat">
            <div class="exec-mini-stat-val" style="color:var(--green)">${exec.successRate}%</div>
            <div class="exec-mini-stat-lbl">Rate</div>
          </div>
        </div>

        <div class="exec-cap-wrap">
          <div class="exec-cap-lbl">
            <span>Capacity</span>
            <span style="color:${color}">${pct}%</span>
          </div>
          <div class="exec-progress">
            <div class="exec-progress-fill" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>

        <div class="exec-success-bar">
          <span>Success</span>
          <div class="success-pips">${pips}</div>
          <span>${exec.successRate}%</span>
        </div>

        <div class="exec-locations">${exec.locations.map(l => `<span class="loc-tag">${escHtml(l)}</span>`).join('')}</div>

        <div class="exec-card-hover-hint">Click to view profile →</div>
      </div>
    `;
  }).join('');
}

// =============================================
//  12. CANVAS CHARTS
// =============================================

function drawDonut(canvasId, segments, legendId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2, R = Math.min(cx,cy) - 8, iR = R * 0.58;

  ctx.clearRect(0, 0, W, H);

  const realTotal = segments.reduce((s, x) => s + x.val, 0);
  if (realTotal === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = R - iR;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `bold 14px Inter`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', cx, cy);
    const leg = document.getElementById(legendId);
    if (leg) leg.innerHTML = segments.map(s => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${s.color}"></div>
        <span class="legend-label">${s.label}</span>
        <span class="legend-val">0</span>
      </div>
    `).join('');
    return;
  }

  let angle = -Math.PI / 2;
  segments.forEach(seg => {
    if (seg.val <= 0) return;
    const sweep = (seg.val / realTotal) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, angle, angle + sweep);
    ctx.arc(cx, cy, iR, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    angle += sweep;
  });

  // Center label
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `bold 18px Inter`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(realTotal, cx, cy - 8);
  ctx.font = `11px Inter`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('total', cx, cy + 10);

  // Legend
  const leg = document.getElementById(legendId);
  if (leg) leg.innerHTML = segments.map(s => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <span class="legend-label">${s.label}</span>
      <span class="legend-val">${s.val}</span>
    </div>
  `).join('');
}

function drawAssignmentDonut() {
  const assigned   = leads.filter(l => l.status === 'assigned').length;
  const unassigned = leads.filter(l => l.status === 'unassigned').length;
  drawDonut('chart-assignment', [
    { val: assigned,   color: '#34d399', label: 'Assigned' },
    { val: unassigned, color: '#f87171', label: 'Unassigned' }
  ], 'donut-legend-assignment');
}

function drawTempDonut() {
  const hot  = leads.filter(l => l.temperature === 'hot').length;
  const warm = leads.filter(l => l.temperature === 'warm').length;
  const cold = leads.filter(l => l.temperature === 'cold').length;
  drawDonut('chart-temp', [
    { val: hot,  color: '#ff4d72', label: '🔥 Hot' },
    { val: warm, color: '#ffaa3b', label: '☀️ Warm' },
    { val: cold, color: '#38b2ff', label: '❄️ Cold' }
  ], 'donut-legend-temp');
}

function drawBar(canvasId, labels, values, colors, maxVal) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 400;
  const H = 240;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const pad = { t: 16, r: 16, b: 44, l: 36 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  ctx.clearRect(0, 0, W, H);

  const max = maxVal || Math.max(...values, 1);
  const barW = Math.min(32, (cw / (labels.length || 1)) - 8);
  const gap  = cw / (labels.length || 1);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch - (i / 4) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + cw, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `10px Inter`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(max * i / 4), pad.l - 4, y + 3);
  }

  values.forEach((val, i) => {
    const bh = val > 0 ? Math.max(4, (val / max) * ch) : 0;
    const x = pad.l + gap * i + (gap - barW) / 2;
    const y = pad.t + ch - bh;

    const grad = ctx.createLinearGradient(x, y, x, pad.t + ch);
    const base = colors[i % colors.length];
    grad.addColorStop(0, base);
    grad.addColorStop(1, base + '44');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, barW, bh, [4, 4, 0, 0]) : ctx.rect(x, y, barW, bh);
    ctx.fill();

    if (val > 0) {
      ctx.fillStyle = base;
      ctx.font = `bold 10px Inter`;
      ctx.textAlign = 'center';
      ctx.fillText(val, x + barW / 2, y - 5);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `10px Inter`;
    ctx.textAlign = 'center';
    const lbl = labels[i].length > 9 ? labels[i].slice(0, 9) + '…' : labels[i];
    ctx.fillText(lbl, x + barW / 2, pad.t + ch + 14);
  });
}

function drawTrendChart() {
  const canvas = document.getElementById('chart-trend');
  if (!canvas) return;

  const W = canvas.offsetWidth || 900;
  const H = 120;
  canvas.width = W * (window.devicePixelRatio || 1);
  canvas.height = H * (window.devicePixelRatio || 1);
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  const data = DAILY_TREND;
  const pad = { t: 16, r: 20, b: 28, l: 36 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const max = Math.max(...data, 1);
  const step = cw / (data.length - 1);

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + cw, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(max * i / 4), pad.l - 4, y + 3);
  }

  const days = ['14d','13d','12d','11d','10d','9d','8d','7d','6d','5d','4d','3d','2d','1d'];
  data.forEach((_, i) => {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(days[i], pad.l + i * step, pad.t + ch + 16);
  });

  const pts = data.map((v, i) => [pad.l + i * step, pad.t + ch - (v / max) * ch]);

  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
  grad.addColorStop(0, 'rgba(124,109,255,0.35)');
  grad.addColorStop(1, 'rgba(124,109,255,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pad.t + ch);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length - 1][0], pad.t + ch);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.strokeStyle = '#7c6dff';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  pts.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6dff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(7,11,20,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function renderAnalytics() {
  const srcCounts = {};
  leads.forEach(l => srcCounts[l.source] = (srcCounts[l.source] || 0) + 1);
  const srcEntries = Object.entries(srcCounts).sort((a,b) => b[1]-a[1]).slice(0,8);
  drawBar('chart-source-bar', srcEntries.map(e=>e[0]), srcEntries.map(e=>e[1]), SOURCE_COLORS);

  const active = executives.filter(e => e.active);
  drawBar('chart-exec-bar',
    active.map(e => e.name.split(' ')[0]),
    active.map(e => e.currentLeads),
    ['#7c6dff','#34d399','#fbbf24','#f87171','#38b2ff','#c49bff','#ffaa3b','#81c784','#ff6b9d','#00c9a7']
  );

  const buckets = { '80-100': 0, '60-79': 0, '40-59': 0, '0-39': 0 };
  leads.forEach(l => {
    const s = l.score;
    if (s >= 80) buckets['80-100']++;
    else if (s >= 60) buckets['60-79']++;
    else if (s >= 40) buckets['40-59']++;
    else buckets['0-39']++;
  });
  drawBar('chart-score-bar', Object.keys(buckets), Object.values(buckets),
    ['#34d399','#a3e635','#fbbf24','#f87171']);

  const locCounts = {};
  leads.forEach(l => locCounts[l.location] = (locCounts[l.location] || 0) + 1);
  const locEntries = Object.entries(locCounts).sort((a,b) => b[1]-a[1]).slice(0,8);
  drawBar('chart-location-bar', locEntries.map(e=>e[0]), locEntries.map(e=>e[1]), SOURCE_COLORS.slice(4));

  const totalScore = leads.reduce((s, l) => s + l.score, 0);
  const avgScore = leads.length ? Math.round(totalScore / leads.length) : 0;
  const hotAssigned = leads.filter(l => l.temperature === 'hot' && l.status === 'assigned').length;
  const hotTotal = leads.filter(l => l.temperature === 'hot').length;
  const dups = leads.filter(l => l.isDuplicate).length;

  const statsEl = document.getElementById('analytics-stats');
  if (statsEl) {
    statsEl.innerHTML = [
      { val: avgScore,   lbl: 'Avg Priority Score', col: avgScore >= 60 ? 'var(--green)' : 'var(--warm)' },
      { val: `${hotTotal > 0 ? Math.round(hotAssigned/hotTotal*100) : 0}%`, lbl: 'Hot Lead Coverage', col: 'var(--hot)' },
      { val: dups,        lbl: 'Duplicate Leads',    col: dups > 0 ? 'var(--yellow)' : 'var(--green)' },
      { val: Object.keys(srcCounts).length, lbl: 'Active Sources', col: 'var(--accent-2)' }
    ].map(s => `
      <div class="glass-card" style="padding:20px;">
        <div style="font-size:24px;font-weight:900;letter-spacing:-1px;color:${s.col};margin-bottom:4px;">${s.val}</div>
        <div style="font-size:12px;color:var(--text-2);">${s.lbl}</div>
      </div>
    `).join('');
  }
}

// =============================================
//  13. UI HELPERS
// =============================================

function tempBadge(temp) {
  const m = { hot:['badge-hot','🔥','Hot'], warm:['badge-warm','☀️','Warm'], cold:['badge-cold','❄️','Cold'] };
  const [cls, icon, lbl] = m[temp] || ['','','Unknown'];
  return `<span class="badge ${cls}">${icon} ${lbl}</span>`;
}

function statusBadge(s) {
  return s === 'assigned'
    ? `<span class="badge badge-ok">✓ Assigned</span>`
    : `<span class="badge badge-warn">⚠ Unassigned</span>`;
}

function scorePill(score) {
  const cls = score >= 70 ? 'score-high' : score >= 40 ? 'score-med' : 'score-low';
  return `<span class="score-pill ${cls}">${score}</span>`;
}

function escHtml(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatTime(d) { return d instanceof Date ? d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'; }
function formatDateTime(d) {
  return d instanceof Date ? d.toLocaleString('en-IN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
}

function showSection(name) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');

  const titles = {
    dashboard:   ['Dashboard',     'Real-time lead intelligence'],
    leads:       ['All Leads',     'Browse, filter and manage leads'],
    executives:  ['Executives',    'Team profiles — click a card to view details'],
    analytics:   ['Analytics',     'Performance insights and trends'],
    'add-lead':  ['Add Lead',      'AI-powered scoring and auto-assignment'],
    admin:       ['Admin Panel',   'System configuration and controls']
  };
  const [t, s] = titles[name] || ['LeadFlow AI', ''];
  document.getElementById('page-title').textContent = t;
  document.getElementById('page-subtitle').textContent = s;

  if (name === 'analytics') {
    setTimeout(() => { renderAnalytics(); drawTrendChart(); }, 50);
  }
  return false;
}

let _toastT;
function showToast(title, body, borderColor = 'var(--accent-2)') {
  const emojiMatch = title.match(/^(\p{Emoji}+)/u);
  const icon  = emojiMatch ? emojiMatch[1] : '📌';
  const label = title.replace(/^(\p{Emoji}+\s*)/u, '') || title;
  document.getElementById('toast-icon').textContent  = icon;
  document.getElementById('toast-title').textContent = label;
  document.getElementById('toast-body').textContent  = body;
  document.getElementById('toast').style.borderLeft  = `3px solid ${borderColor}`;
  document.getElementById('toast').classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => document.getElementById('toast').classList.remove('show'), 4200);
}

function updateClock() {
  const now = new Date();
  const el = document.getElementById('topbar-time');
  if (el) el.textContent = now.toLocaleString('en-IN',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const sub = document.getElementById('health-sub');
  if (sub) sub.textContent = `${leads.length} leads · ${now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`;
}

// =============================================
//  14. INITIALISATION
// =============================================

async function init() {
  updateClock();
  setInterval(updateClock, 1000);

  // Resize charts on window resize
  window.addEventListener('resize', () => {
    drawTrendChart();
    renderAnalytics();
  });

  if (token) {
    try {
      document.getElementById('login-overlay').classList.add('hidden');
      document.body.classList.remove('logged-out');
      
      applyRoleRestrictions();
      await loadInitialData();
    } catch (err) {
      console.warn('Initial session validation failed:', err);
      handleLogout();
    }
  } else {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.body.classList.add('logged-out');
  }

  // Console log banner
  console.log('%c LeadFlow AI v2 ', 'background:#7c6dff;color:#fff;font-weight:bold;font-size:14px;border-radius:4px;padding:2px 8px;');
}

document.addEventListener('DOMContentLoaded', init);
