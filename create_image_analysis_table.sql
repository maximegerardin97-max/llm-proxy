-- Create image_analysis table for storing image analysis results
CREATE TABLE IF NOT EXISTS image_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  flow TEXT NOT NULL,
  text TEXT DEFAULT '',
  description TEXT DEFAULT '',
  ui_elements JSONB DEFAULT '[]'::jsonb,
  colors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_image_analysis_text ON image_analysis USING gin(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_image_analysis_description ON image_analysis USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_image_analysis_flow ON image_analysis(flow);
CREATE INDEX IF NOT EXISTS idx_image_analysis_file_path ON image_analysis(file_path);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_image_analysis_updated_at 
    BEFORE UPDATE ON image_analysis 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
