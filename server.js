require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Set it in your environment variables.');
  process.exit(1);
}

const app = require('./app');
const { pool } = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  app.listen(PORT, () => {
    console.log(`🚀 ERP API server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  // Verify DB connectivity after binding (don't block startup or crash on timeout)
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL (Supabase)');
  } catch (err) {
    console.error('⚠️  DB health check failed (server still running):', err.message);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing pool...');
  await pool.end();
  process.exit(0);
});
