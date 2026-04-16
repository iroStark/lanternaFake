require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config — store files on disk in uploads/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.m4a';
    cb(null, `recording-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /audio\//;
    if (allowed.test(file.mimetype) || file.originalname.match(/\.(m4a|mp3|wav|aac|ogg|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploads as static files
app.use('/uploads', express.static(uploadsDir));

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

    const recordedAt = recorded_at ? new Date(recorded_at) : new Date();
    const durationInt = duration ? parseInt(duration, 10) : null;
    const fileSize = req.file.size;

    const result = await pool.query(
      `INSERT INTO recordings
         (filename, original_name, duration, file_size, recorded_at, device_info)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.file.filename,
        originalName || req.file.originalname,
        durationInt,
        fileSize,
        recordedAt,
        device_info || null,
      ]
    );

    res.status(201).json({ recording: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recordings error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── GET /api/recordings ─────────────────────────────────────────────────────

app.get('/api/recordings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM recordings ORDER BY uploaded_at DESC LIMIT $1 OFFSET $2`,
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
      `SELECT * FROM recordings WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json({ recording: result.rows[0] });
  } catch (err) {
    console.error('GET /api/recordings/:id error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── GET /api/recordings/:id/audio ───────────────────────────────────────────

app.get('/api/recordings/:id/audio', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM recordings WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const recording = result.rows[0];
    const filePath = path.join(uploadsDir, recording.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(recording.filename).toLowerCase();
    const mimeTypes = {
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
    };
    const contentType = mimeTypes[ext] || 'audio/octet-stream';

    // Support range requests for streaming
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${recording.original_name || recording.filename}"`,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('GET /api/recordings/:id/audio error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── DELETE /api/recordings/:id ──────────────────────────────────────────────

app.delete('/api/recordings/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM recordings WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Delete the audio file from disk
    const recording = result.rows[0];
    const filePath = path.join(uploadsDir, recording.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Recording deleted', recording: recording });
  } catch (err) {
    console.error('DELETE /api/recordings/:id error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Lanterna backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
