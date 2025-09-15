#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 LLM Proxy Setup');
console.log('==================\n');

// Check if .env exists
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, 'env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    console.log('📝 Creating .env file from template...');
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created! Please edit it with your API keys.\n');
  } else {
    console.log('❌ env.example file not found!');
    process.exit(1);
  }
} else {
  console.log('✅ .env file already exists.\n');
}

// Create knowledge base directory
const knowledgeBasePath = path.join(__dirname, 'knowledge_base');
if (!fs.existsSync(knowledgeBasePath)) {
  console.log('📁 Creating knowledge base directory...');
  fs.mkdirSync(knowledgeBasePath, { recursive: true });
  console.log('✅ Knowledge base directory created!\n');
} else {
  console.log('✅ Knowledge base directory already exists.\n');
}

// Check for API keys
console.log('🔑 API Key Status:');
console.log('==================');

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  const openaiKey = envContent.match(/OPENAI_API_KEY=(.+)/)?.[1];
  const googleKey = envContent.match(/GOOGLE_API_KEY=(.+)/)?.[1];
  
  if (openaiKey && openaiKey !== 'your_openai_api_key_here') {
    console.log('✅ OpenAI API key is set');
  } else {
    console.log('❌ OpenAI API key not set (optional)');
  }
  
  if (googleKey && googleKey !== 'your_google_api_key_here') {
    console.log('✅ Google API key is set');
  } else {
    console.log('❌ Google API key not set (optional)');
  }
  
  if ((!openaiKey || openaiKey === 'your_openai_api_key_here') && 
      (!googleKey || googleKey === 'your_google_api_key_here')) {
    console.log('\n⚠️  Warning: No API keys are set. You need at least one to use the LLM proxy.');
    console.log('   Please edit the .env file and add your API keys.');
  }
  
} catch (error) {
  console.log('❌ Error reading .env file:', error.message);
}

console.log('\n🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Edit .env file with your API keys');
console.log('2. Run: npm start');
console.log('3. Open: http://localhost:3000');
console.log('\nFor development with auto-reload: npm run dev');
