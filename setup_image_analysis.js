import { createClient } from '@supabase/supabase-js';
import config from './src/config/index.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

async function createImageAnalysisTable() {
  try {
    console.log('🔧 Testing if image_analysis table exists...');
    
    // Try to query the table to see if it exists
    const { data: testData, error: testError } = await supabase
      .from('image_analysis')
      .select('count', { count: 'exact', head: true });

    if (testError) {
      console.log('❌ Table does not exist, creating it...');
      
      // Since we can't create tables via the client, let's provide instructions
      console.log(`
🔧 MANUAL SETUP REQUIRED:

Please run this SQL in your Supabase SQL Editor:

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

CREATE INDEX IF NOT EXISTS idx_image_analysis_text ON image_analysis USING gin(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_image_analysis_description ON image_analysis USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_image_analysis_flow ON image_analysis(flow);
CREATE INDEX IF NOT EXISTS idx_image_analysis_file_path ON image_analysis(file_path);

Then run this script again to test the connection.
      `);
      return;
    }

    console.log('✅ Table exists and is accessible');
    console.log(`📊 Current records: ${testData?.length || 0}`);

  } catch (error) {
    console.error('Setup error:', error);
  }
}

createImageAnalysisTable();
