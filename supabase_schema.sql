CREATE TABLE template_metadata (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  visual_analysis TEXT,
  tags JSONB,
  category TEXT,
  platform_origin TEXT,
  image_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
