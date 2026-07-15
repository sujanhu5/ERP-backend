require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Verify DB connection before accepting traffic
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL (Supabase)');

    app.listen(PORT, () => {
      console.log(`🚀 ERP API server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing pool...');
  await pool.end();
  process.exit(0);
});
