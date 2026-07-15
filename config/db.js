/**
 * PostgreSQL connection pool (Supabase-hosted).
 * All queries across the app go through this single pool.
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('✅ PostgreSQL pool: new client connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error', err);
  process.exit(-1);
});

/**
 * Helper for simple queries with automatic logging in dev.
 */
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('🗄️  query', { text, duration, rows: res.rowCount });
  }
  return res;
};

/**
 * Get a client for multi-statement transactions.
 * Usage:
 *   const client = await getClient();
 *   try { await client.query('BEGIN'); ... await client.query('COMMIT'); }
 *   catch (e) { await client.query('ROLLBACK'); throw e; }
 *   finally { client.release(); }
 */
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
