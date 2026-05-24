// =============================================
//  src/config/db.js — PostgreSQL Connection Pool
//  Uses node-postgres (pg) with connection pooling
//  All queries go through this module
// =============================================

'use strict';

const { Pool } = require('pg');

// ── Build connection config from env ──────────
const config = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'leadflow_dev',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',

  // Pool settings
  max:             20,    // max connections in pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,

  // SSL for production
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false
};

const pool = new Pool(config);

// ── Test connection on startup ─────────────────
pool.connect((err, client, release) => {
  if (err) {
    console.error('  ❌  PostgreSQL connection failed:', err.message);
    console.error('      Check your .env DB_* settings and ensure PostgreSQL is running.');
    return;
  }
  client.query('SELECT NOW()', (qErr, result) => {
    release();
    if (qErr) {
      console.error('  ❌  DB query test failed:', qErr.message);
    } else {
      console.log(`  ✅  PostgreSQL connected — server time: ${result.rows[0].now}`);
    }
  });
});

pool.on('error', (err) => {
  console.error('  ❌  Unexpected DB pool error:', err.message);
});

// ── Query helper ──────────────────────────────
// Usage:  const { rows } = await query('SELECT * FROM leads WHERE id = $1', [id]);
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`  🗄️  Query (${duration}ms): ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`);
    }
    return result;
  } catch (err) {
    console.error('  ❌  DB query error:', err.message);
    console.error('      Query:', text);
    console.error('      Params:', params);
    throw err;
  }
}

// ── Transaction helper ─────────────────────────
// Usage:
//   await transaction(async (client) => {
//     await client.query('INSERT INTO ...');
//     await client.query('UPDATE ...');
//   });
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };
