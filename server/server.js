// =============================================
//  server.js — Entry Point
//  Loads env, starts HTTP server, handles
//  graceful shutdown on SIGINT/SIGTERM
// =============================================

'use strict';

require('dotenv').config();

const app  = require('./src/app');
const { pool } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

// ── Start server ─────────────────────────────
const server = app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║      LeadFlow AI — API Server        ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log(`  🚀  Running on   http://localhost:${PORT}`);
  console.log(`  🌍  Environment  ${process.env.NODE_ENV || 'development'}`);
  console.log(`  🗄️   Database     ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  console.log('');
});

// ── Graceful shutdown ─────────────────────────
async function shutdown(signal) {
  console.log(`\n  📴  ${signal} received — shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    console.log('  ✅  DB pool closed. Server stopped.');
    process.exit(0);
  });
  // Force exit after 10s if hanging
  setTimeout(() => {
    console.error('  ❌  Forced exit after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Unhandled rejection safety net ───────────
process.on('unhandledRejection', (reason) => {
  console.error('  ❌  Unhandled Promise Rejection:', reason);
});
