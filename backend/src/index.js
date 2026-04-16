require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Store uploads in memory — persisted to PostgreSQL BYTEA column.
// This avoids Railway's ephemeral filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (
      /^audio\//.test(file.mimetype) ||
      /^video\/webm/.test(file.mimetype) ||
      /\.(m4a|mp3|wav|aac|ogg|webm)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ───────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── POST /api/recordings ────────────────────────────────────────────────────

app.post('/api/recordings', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { duration, filename: originalName, recorded_at, device_info } = req.body;
    const storedFilename = originalName || req.file.originalname || 'recording.webm';
    const recordedAt = recorded_at ? new Date(recorded_at) : new Date();
    const durationInt = duration ? parseInt(duration, 10) : null;

    const result = await pool.query(
      `INSERT INTO recordings
         (filename, original_name, duration, file_size, recorded_at, device_info, audio_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, filename, original_name, duration, file_size, recorded_at, uploaded_at, device_info`,
      [
        storedFilename,
        storedFilename,
        durationInt,
        req.file.size,
        recordedAt,
        device_info || null,
        req.file.buffer,
      ]
    );

    res.status(201).json({ recording: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recordings error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── GET /api/recordings ─────────────────────────────────────────────────────
// Excludes audio_data from list response (too large)

app.get('/api/recordings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, filename, original_name, duration, file_size, recorded_at, uploaded_at, device_info
         FROM recordings ORDER BY uploaded_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM recordings`),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      recordings: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('GET /api/recordings error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── GET /api/recordings/stats ───────────────────────────────────────────────

app.get('/api/recordings/stats', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_recordings,
         COALESCE(SUM(duration), 0) AS total_duration_seconds,
         COALESCE(SUM(file_size), 0) AS total_file_size_bytes
       FROM recordings`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/recordings/stats error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── GET /api/recordings/:id ──────────────────────────────────────────────────

app.get('/api/recordings/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, original_name, duration, file_size, recorded_at, uploaded_at, device_info
       FROM recordings WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    res.json({ recording: result.rows[0] });
  } catch (err) {
    console.error('GET /api/recordings/:id error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── GET /api/recordings/:id/audio ───────────────────────────────────────────
// Streams audio bytes stored in the BYTEA column

app.get('/api/recordings/:id/audio', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT filename, original_name, audio_data FROM recordings WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const rec = result.rows[0];
    if (!rec.audio_data) {
      return res.status(404).json({ error: 'No audio data stored' });
    }

    const buf = Buffer.from(rec.audio_data);
    const ext = path.extname(rec.filename).toLowerCase();
    const mimeMap = {
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
    };
    const contentType = mimeMap[ext] || 'audio/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${rec.original_name || rec.filename}"`
    );
    res.send(buf);
  } catch (err) {
    console.error('GET /api/recordings/:id/audio error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── DELETE /api/recordings/:id ──────────────────────────────────────────────

app.delete('/api/recordings/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM recordings WHERE id = $1
       RETURNING id, filename, original_name`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    res.json({ message: 'Recording deleted', recording: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/recordings/:id error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── Serve React admin (built into ./public) ──────────────────────────────────

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Catch-all: serve React index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Lanterna backend running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
