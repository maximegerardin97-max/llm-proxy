import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Keys
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
  },
  fireworks: {
    apiKey: process.env.FIREWORKS_API_KEY,
  },
  
  // Knowledge Base
  knowledgeBase: {
    path: process.env.KNOWLEDGE_BASE_PATH || './knowledge_base',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'pdf,docx,txt,md,jpg,jpeg,png,gif').split(','),
    type: process.env.KNOWLEDGE_BASE_TYPE || 'file', // 'file' or 'supabase'
  },
  
  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    tableName: process.env.SUPABASE_TABLE_NAME || 'screens',
  },
  
  // LLM Configuration
  llm: {
    defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'openai',
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.MAX_TOKENS) || 4000,
    temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
  },
  
  // Supported providers and models
  providers: {
    openai: {
      name: 'OpenAI',
      displayName: 'OpenAI',
      logo: '🤖',
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-4-vision-preview'],
      bestModel: 'gpt-4o',
      description: "OpenAI's GPT4-o model.",
      supportsImages: true,
      supportsStreaming: true,
    },
    anthropic: {
      name: 'Anthropic',
      displayName: 'Anthropic',
      logo: '🧠',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      bestModel: 'claude-3-5-sonnet-20241022',
      description: "Anthropic's balanced Claude 4 model.",
      supportsImages: true,
      supportsStreaming: true,
    },
    mistral: {
      name: 'Mistral',
      displayName: 'Mistral',
      logo: '🌊',
      models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
      bestModel: 'mistral-large-latest',
      description: "Mistral's large model.",
      supportsImages: false,
      supportsStreaming: true,
    },
    google: {
      name: 'Google',
      displayName: 'Google',
      logo: '⭐',
      models: ['gemini-2.5-pro', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
      bestModel: 'gemini-2.5-pro',
      description: "Google's powerful model.",
      supportsImages: true,
      supportsStreaming: true,
    },
    fireworks: {
      name: 'Fireworks',
      displayName: 'Fireworks',
      logo: '🎆',
      models: ['llama-v3p1-70b-instruct', 'llama-v3p1-8b-instruct', 'qwen-2.5-72b-instruct', 'qwen-2.5-14b-instruct'],
      bestModel: 'llama-v3p1-70b-instruct',
      description: "Fireworks' high-performance models.",
      supportsImages: false,
      supportsStreaming: true,
    },
  },
};

export default config;
