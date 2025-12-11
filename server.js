
/**
 * Standalone Backend Server for Ad Genie
 * 
 * Dependencies: 
 * npm install express cors multer @supabase/supabase-js sharp dotenv
 * 
 * Environment Variables (.env):
 * PORT=3000
 * SUPABASE_URL=your_supabase_url
 * SUPABASE_KEY=your_supabase_service_role_key
 * SUPABASE_BUCKET=ad-genie-assets
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Supabase Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'ad-genie-assets';

app.use(cors());
app.use(express.json());

// --- Routes ---

// GET: Fetch entire library
app.get('/api/images/library', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ad_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// POST: Upload Image
app.post('/api/images/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    // 1. Optimize Image
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const fileName = `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;

    // 2. Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(fileName, optimizedBuffer, {
        contentType: 'image/jpeg'
      });

    if (storageError) throw storageError;

    // 3. Get Public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    // 4. Save Metadata to DB
    // Note: In a real app, you might run Gemini analysis here on the server
    // or pass the analysis data from the client in req.body
    const meta = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    
    const { data: dbData, error: dbError } = await supabase
      .from('ad_templates')
      .insert({
        name: meta.name || 'Uploaded Asset',
        description: meta.description || '',
        tags: meta.tags || ['uploaded'],
        image_url: publicUrl,
        storage_path: fileName
      })
      .select()
      .single();

    if (dbError) throw dbError;

    res.json(dbData);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// DELETE: Remove image
app.delete('/api/images/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get storage path first
    const { data: record, error: fetchError } = await supabase
      .from('ad_templates')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Delete from Storage
    if (record.storage_path) {
      await supabase.storage.from(BUCKET_NAME).remove([record.storage_path]);
    }

    // Delete from DB
    const { error: deleteError } = await supabase
      .from('ad_templates')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Serve static files from Vite build
const path = require('path');
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
