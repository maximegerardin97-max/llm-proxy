import { createClient } from '@supabase/supabase-js';
import config from './src/config/index.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

async function createTable() {
  try {
    console.log('🔧 Creating image_analysis table directly...');
    
    // Try to create the table using a direct SQL query
    const { data, error } = await supabase
      .from('image_analysis')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('❌ Table does not exist, need to create it manually');
      console.log(`
🔧 MANUAL SETUP REQUIRED:

Please go to your Supabase dashboard and run this SQL in the SQL Editor:

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_image_analysis_text ON image_analysis USING gin(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_image_analysis_description ON image_analysis USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_image_analysis_flow ON image_analysis(flow);
CREATE INDEX IF NOT EXISTS idx_image_analysis_file_path ON image_analysis(file_path);

-- Grant permissions
GRANT ALL ON image_analysis TO authenticated;
GRANT ALL ON image_analysis TO anon;
GRANT ALL ON image_analysis TO service_role;
      `);
      return;
    }
    
    console.log('✅ Table exists and is accessible');
    console.log('📊 Records:', data?.length || 0);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createTable();
