const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        filename      TEXT      NOT NULL,
        original_name TEXT,
        duration      INTEGER,
        file_size     INTEGER,
        recorded_at   TIMESTAMP,
        uploaded_at   TIMESTAMP DEFAULT NOW(),
        device_info   TEXT,
        audio_data    BYTEA
      );
    `);
    // Migrate existing table (adds column if upgrading from old schema)
    await client.query(`
      ALTER TABLE recordings ADD COLUMN IF NOT EXISTS audio_data BYTEA;
    `);
    console.log('Database initialized — table "recordings" ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
