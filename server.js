
/**
 * Standalone Backend Server for Ad Genie
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Simple File Logger
const logError = (msg, error) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ERROR: ${msg} - ${error?.message || error}\n${error?.stack ? error.stack + '\n' : ''}`;
  console.error(msg, error);
  fs.appendFile('server.log', logMessage, (err) => {
    if (err) console.error("Failed to write to log file:", err);
  });
};

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_BUCKET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const app = express();

// File upload configuration with validation
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));
    }
  }
});

// Supabase Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BUCKET_NAME = process.env.SUPABASE_BUCKET;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Upload Rate Limit (High for bulk uploads)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1000,
  message: 'Too many uploads, please try again later.',
});

app.use(cors());
app.use(express.json());

// Serve static files (assets with long cache)
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1y',
  etag: true,
  setHeaders: (res, path) => {
    if (path.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// --- Routes ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET: Fetch Library
app.get('/api/images/library', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('image_library')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logError('Supabase fetch error', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    res.json(data || []);
  } catch (err) {
    logError('Library fetch server error', err);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// DELETE: Clear ENTIRE Library
app.delete('/api/images/library', async (req, res) => {
  try {
    const { data: files, error: fetchError } = await supabase
      .from('image_library')
      .select('image_url');

    if (fetchError) throw fetchError;

    if (files && files.length > 0) {
      // Extract filenames from image URLs for storage cleanup
      const paths = files
        .map(f => f.image_url)
        .filter(url => url && url.includes(BUCKET_NAME))
        .map(url => url.split('/').pop());
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove(paths);
        if (storageError) logError('Bulk storage delete warning', storageError);
      }
    }

    const { error: deleteError } = await supabase
      .from('image_library')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) throw deleteError;

    res.json({ success: true, message: "Library cleared" });
  } catch (err) {
    logError('Clear library failed', err);
    res.status(500).json({ error: 'Clear library failed', details: err.message });
  }
});

// POST: Upload Image
app.post('/api/images/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type', allowed: ALLOWED_MIME_TYPES });
    }

    const imageInfo = await sharp(req.file.buffer).metadata();
    const quality = imageInfo.size && imageInfo.size > 2 * 1024 * 1024 ? 75 : 80;

    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, progressive: true })
      .toBuffer();

    const fileName = `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;

    const { data: storageData, error: storageError } = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(fileName, optimizedBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });

    if (storageError) {
      logError('Storage upload error', storageError);
      return res.status(500).json({ error: 'Failed to upload to storage', details: storageError.message });
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

    const meta = req.body.metadata ? JSON.parse(req.body.metadata) : {};

    const { data: dbData, error: dbError } = await supabase
      .from('image_library')
      .insert({
        name: meta.name || 'Uploaded Asset',
        description: meta.description || '',
        tags: meta.tags || ['uploaded'],
        image_url: publicUrl
      })
      .select()
      .single();

    if (dbError) {
      logError('Database insert error', dbError);
      await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      return res.status(500).json({ error: 'Failed to save to database', details: dbError.message });
    }

    res.json(dbData);

  } catch (err) {
    logError('Upload endpoint error', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// DELETE: Single Image
app.delete('/api/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing image ID' });

    const { data: record, error: fetchError } = await supabase
      .from('image_library')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError) {
      // If not found, just return success or 404. 
      return res.status(404).json({ error: 'Template not found' });
    }

    // Extract filename from image URL for storage cleanup
    if (record.image_url && record.image_url.includes(BUCKET_NAME)) {
      const fileName = record.image_url.split('/').pop();
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([fileName]);
      if (storageError) console.warn('Storage deletion warning:', storageError);
    }

    const { error: deleteError } = await supabase
      .from('image_library')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logError('Database delete error', deleteError);
      return res.status(500).json({ error: 'Failed to delete from database' });
    }

    res.json({ success: true });

  } catch (err) {
    logError('Delete error', err);
    res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

// Global Error Handler - catches multer errors and other unhandled errors
// Must be defined before the SPA fallback to work properly
app.use((err, req, res, next) => {
  logError('Unhandled error', err);

  // Handle multer-specific errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: 'File upload error',
      details: err.message,
      code: err.code
    });
  }

  // Handle file filter rejection
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      details: err.message
    });
  }

  // Handle other errors
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}

module.exports = app;
