# LeadFlow AI — Intelligent Lead Distribution Platform

<div align="center">

![LeadFlow AI](https://img.shields.io/badge/LeadFlow-AI%20v2.0-7c6dff?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMyA5bDktNyA5IDd2MTFhMiAyIDAgMDEtMiAySDVhMiAyIDAgMDEtMi0yeiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+)
![Version](https://img.shields.io/badge/version-2.0.0-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-Production%20Ready-34d399?style=for-the-badge)

**AI-powered auto lead distribution system for real estate businesses.**  
Smart assignment · Priority scoring · Duplicate detection · WhatsApp-ready · Zero dependencies.

[🚀 Live Demo](#-live-demo) · [✨ Features](#-features) · [🏗️ Architecture](#️-architecture) · [🗺️ Roadmap](#️-roadmap)

</div>

---

## 📸 Screenshots

| Dashboard | All Leads | Analytics |
|-----------|-----------|-----------|
| 6 live stat cards, donut charts, trend sparkline | Full filterable table with Reassign + History | 4 canvas bar charts, score distribution |

| Add Lead | Exec Panel | Admin Panel |
|----------|-----------|-------------|
| AI score ring animates live as you type | Click any exec card → slide-over profile | Toggle modes, manage capacity, system health |

---

## ✨ Features

### 🧠 AI Assignment Engine
- **Priority Scoring (0–100)** — every lead scored by temperature, budget, source & property type
- **Smart Mode** — assigns to the executive with the lowest current load
- **Round-Robin Mode** — strict rotation per location group
- **Toggle between modes** instantly from Admin Panel

### 🔍 Duplicate Detection
- **Hard block** on matching phone numbers (stripped, normalized)
- **Soft warning** on matching names
- **Override** option for intentional duplicates
- **DUP badge** shown in lead table

### 📊 Real-Time Dashboard
- 6 live stat cards (total, assigned, unassigned, hot/warm/cold)
- Assignment rate donut chart
- Temperature distribution donut chart
- 14-day lead volume trend sparkline
- Executive performance capacity bars

### 📈 Analytics (7 Canvas Charts — Zero Libraries)
- Leads by source
- Executive load comparison
- Priority score distribution
- Leads by location
- All built with HTML5 Canvas API — no Chart.js, no D3.js

### 👤 Executive Profiles
- Clickable glassmorphism cards
- Slide-over panel: assigned leads, stats, history, expertise
- Success rate pip display
- Status ring (active/inactive)

### 📋 Lead Management
- Full filterable table (temperature, status, source, exec)
- Live search across name, phone, location
- **Reassign** with reason + history entry
- **History timeline** per lead (full audit trail)
- Duplicate flagging

### ⚙️ Admin Panel
- Distribution mode toggle (Smart ↔ Round-Robin)
- Duplicate detection toggle
- Per-executive capacity editor (inline)
- Per-executive active/inactive toggle
- System health metrics grid
- Reset daily counters

---

## 🗂️ Project Structure

```
lead-distribution-system/
│
├── index.html          # App shell — 6 sections, 4 modals, slide-over panel
├── styles.css          # Complete glassmorphism design system (~41KB)
├── data.js             # Executives DB, seed leads, app settings
├── app.js              # Business logic engine (~700 lines, 14 modules)
│
├── .gitignore
└── README.md
```

---

## 🧩 App Modules (`app.js`)

| Module | Function |
|--------|----------|
| **1. Priority Scoring** | `calcScore(lead)` — returns 0–100 score |
| **2. Duplicate Detection** | `detectDuplicate(data, excludeId)` — phone + name matching |
| **3. Assignment Engine** | `assignLead()`, `getEligible()`, `assignRoundRobin()` |
| **4. Lead Creation** | `createLead(data, skipDupCheck)` — full pipeline |
| **5. Reassignment** | `openReassignModal()`, `confirmReassign()` |
| **6. Redistribute** | `redistributeAll()` — retry all unassigned leads |
| **7. Form Handling** | `submitLead()`, `finalizeLead()`, `showDupWarning()` |
| **8. Score Preview** | `updateScorePreview()`, `animateScoreRing()` |
| **9. Exec Panel** | `openExecPanel()`, `historyItem()` |
| **10. Admin Panel** | `renderAdminPanel()`, `toggleExecStatus()`, `setDistributionMode()` |
| **11. Render Engine** | `renderAll()` — drives all 12 UI components |
| **12. Canvas Charts** | `drawDonut()`, `drawBar()`, `drawTrendChart()` |
| **13. UI Helpers** | `tempBadge()`, `scorePill()`, `showToast()`, `escHtml()` |
| **14. Init** | `init()` — seeds data, wires clock, starts app |

---

## 🎯 Priority Scoring Formula

```
Score (0–100) = Temperature + Budget + Source + Property Type

Temperature:  Hot=40   Warm=25   Cold=10
Budget:       >₹2Cr=30  ₹1Cr–2Cr=24  ₹60L–1Cr=18  ₹30L–60L=12  <₹30L=6
Source:       Referral=20  Walk-in=18  MagicBricks/99acres=14  Housing=12  Google=10
Property:     Villa/Penthouse=10  4BHK+=8  Commercial=7  3BHK=5  2BHK=4  1BHK=3
```

**Example:** Referral + Hot + >₹2Cr + Villa = **80/100** 🟢  
**Example:** Facebook + Cold + <₹30L + 1BHK = **27/100** 🔴

---

## 🚀 Live Demo

Open `index.html` in any modern browser — no server, no build step, no npm install.

```bash
git clone https://github.com/YOUR_USERNAME/leadflow-ai.git
cd leadflow-ai
# Open index.html in your browser — that's it!
```

### Seed Data Included
- **10 executives** across Mumbai, Bangalore, Pune, Gurgaon
- **22 leads** covering all temperatures, budgets, sources, and locations
- **1 inactive executive** (Deepika Rao) to test exclusion logic

---

## 🏗️ Architecture

### Current (v2 Demo)
```
Browser
  ├── index.html  → App shell + 4 modals + slide-over
  ├── styles.css  → Glassmorphism design system
  ├── data.js     → In-memory state (executives + seed leads)
  └── app.js      → Full business logic (14 modules)
```

### Production Roadmap

```
Phase 1 — MVP (4–6 weeks)
  Backend:   Node.js + Express
  Database:  PostgreSQL
  Auth:      JWT + bcrypt (admin + executive login)
  Notify:    n8n + Twilio WhatsApp Business API
  Deploy:    Railway / Render

Phase 2 — Client-Ready (8–12 weeks)
  + Executive portal (own login view)
  + Lead status pipeline (6 stages)
  + Portal webhooks (99acres, MagicBricks, Housing.com)
  + CSV bulk import
  + Daily WhatsApp follow-up reminders (n8n cron)

Phase 3 — SaaS (16–24 weeks)
  + Multi-tenant (row-level isolation)
  + Stripe billing
  + White-label (custom domain + logo)
  + Mobile app (React Native)
  + ML priority scoring (Python microservice)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full production plan with database schema, API endpoints, and deployment configs.

---

## 🗄️ Database Schema (Production)

Five core tables:

```sql
tenants              → one row per agency
users                → admins, managers, executives
leads                → all leads with score + status
assignment_history   → full audit trail of every action
daily_counters       → per-exec per-day lead counts (replaces in-memory counter)
```

---

## 🔌 API Endpoints (Production)

```
POST   /api/leads                → create + auto-assign + notify WhatsApp
GET    /api/leads                → paginated, filterable list
POST   /api/leads/:id/reassign   → reassign with reason + history
GET    /api/analytics/dashboard  → stat cards data
GET    /api/analytics/trend      → 14-day volume trend
POST   /api/webhooks/99acres     → ingest lead from portal
POST   /api/webhooks/magicbricks → ingest lead from portal
```

---

## 📱 WhatsApp Notification Flow

```
Lead submitted → Assignment Engine → Bull queue
    → n8n webhook trigger
    → Twilio WhatsApp Business API
    → Executive's WhatsApp:

    "🔥 New Lead Assigned!
     Name: Riya Desai
     Phone: +91 99001 00117
     Location: Bandra
     Budget: >₹2Cr
     Score: 80/100
     Priority: HOT"
```

---

## 🔒 Security Features

- JWT auth with 15-min access tokens + refresh rotation
- RBAC: Admin / Manager / Executive (scoped permissions)
- PostgreSQL Row-Level Security (tenant isolation)
- Rate limiting (100 req/15min, Redis-backed)
- Input validation (Zod) on all endpoints
- HMAC-SHA256 signature on webhook ingest
- AES-256 encryption for PII at rest

---

## 💰 Pricing (SaaS)

| Plan | Price | Executives | Leads/Month |
|------|-------|-----------|-------------|
| **Starter** | ₹2,999/mo | Up to 5 | 200 |
| **Growth** | ₹7,999/mo | Up to 20 | Unlimited |
| **Enterprise** | ₹25,000+/mo | Unlimited | Unlimited |

---

## 🗺️ Roadmap

- [x] Priority scoring engine (0–100)
- [x] Duplicate detection (phone + name)
- [x] Smart assignment (lowest load)
- [x] Round-robin assignment
- [x] Capacity limits per executive
- [x] Inactive executive exclusion
- [x] Reassignment with history
- [x] Full assignment history timeline
- [x] Executive slide-over profile panel
- [x] Admin panel (modes, capacity, toggles)
- [x] 7 canvas charts (zero libraries)
- [x] Glassmorphism UI + animated background
- [x] Toast notifications
- [x] Responsive layout (mobile/tablet/desktop)
- [ ] Node.js + PostgreSQL backend (Phase 1)
- [ ] JWT auth — admin + executive login
- [ ] n8n + WhatsApp notifications
- [ ] Portal webhooks (99acres, MagicBricks)
- [ ] CSV bulk import
- [ ] Lead status pipeline (6 stages)
- [ ] Stripe billing integration
- [ ] Multi-tenant SaaS
- [ ] React Native mobile app

---

## 🤝 Contributing

Pull requests welcome. For major changes, please open an issue first.

1. Fork the repo
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'feat: add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

[MIT](./LICENSE) — free for personal and commercial use.

---

<div align="center">

Built with ❤️ for real estate businesses  
**LeadFlow AI** — Stop losing hot leads. Start closing deals.

</div>
