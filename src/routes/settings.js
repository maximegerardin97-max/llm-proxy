import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

async function getSupabaseClient(config) {
  const url = config.supabase?.url;
  const key = config.supabase?.key;
  if (url && key && /^https?:\/\//.test(url)) {
    return createClient(url, key);
  }
  return null;
}

const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

async function readSettingsFromFile() {
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (_) {
    return {};
  }
}

async function writeSettingsToFile(settings) {
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Get app settings (systemPrompt, provider, model)
router.get('/settings', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const supabase = await getSupabaseClient(config);
    let settings = {};

    if (supabase) {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, system_prompt, provider, model')
        .eq('key', 'default')
        .maybeSingle();
      if (!error && data) {
        settings = {
          systemPrompt: data.system_prompt || '',
          provider: data.provider || config.llm?.defaultProvider,
          model: data.model || config.llm?.defaultModel
        };
      }
    }

    if (!settings.systemPrompt && !settings.provider && !settings.model) {
      const fileSettings = await readSettingsFromFile();
      settings = {
        systemPrompt: fileSettings.systemPrompt || '',
        provider: fileSettings.provider || config.llm?.defaultProvider,
        model: fileSettings.model || config.llm?.defaultModel
      };
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update app settings (partial updates)
router.put('/settings', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const { systemPrompt, provider, model } = req.body || {};

    // Merge with existing
    const current = await (async () => {
      try {
        const resp = await fetch('http://localhost');
        void resp; // no-op to please bundlers if needed
      } catch (_) {}
      const fileSettings = await readSettingsFromFile();
      return {
        systemPrompt: fileSettings.systemPrompt || '',
        provider: fileSettings.provider || config.llm?.defaultProvider,
        model: fileSettings.model || config.llm?.defaultModel
      };
    })();

    const nextSettings = {
      systemPrompt: systemPrompt !== undefined ? systemPrompt : current.systemPrompt,
      provider: provider !== undefined ? provider : current.provider,
      model: model !== undefined ? model : current.model
    };

    let persisted = false;
    const supabase = await getSupabaseClient(config);
    if (supabase) {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'default',
          system_prompt: nextSettings.systemPrompt || '',
          provider: nextSettings.provider || null,
          model: nextSettings.model || null
        }, { onConflict: 'key' });
      if (!error) persisted = true;
    }

    if (!persisted) {
      await writeSettingsToFile(nextSettings);
    }

    // Also reflect in running config defaults if provided
    if (nextSettings.provider) config.llm.defaultProvider = nextSettings.provider;
    if (nextSettings.model) config.llm.defaultModel = nextSettings.model;

    res.json({ success: true, settings: nextSettings, storage: persisted ? 'supabase' : 'file' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current API keys (masked)
router.get('/api-keys', (req, res) => {
  try {
    const config = req.app.locals.config;
    const apiKeys = {
      openai: {
        hasKey: !!config.openai.apiKey,
        masked: config.openai.apiKey ? `sk-...${config.openai.apiKey.slice(-4)}` : null
      },
      google: {
        hasKey: !!config.google.apiKey,
        masked: config.google.apiKey ? `${config.google.apiKey.slice(0, 8)}...${config.google.apiKey.slice(-4)}` : null
      },
      anthropic: {
        hasKey: !!config.anthropic.apiKey,
        masked: config.anthropic.apiKey ? `sk-ant-...${config.anthropic.apiKey.slice(-4)}` : null
      },
      mistral: {
        hasKey: !!config.mistral.apiKey,
        masked: config.mistral.apiKey ? `${config.mistral.apiKey.slice(0, 8)}...${config.mistral.apiKey.slice(-4)}` : null
      },
      fireworks: {
        hasKey: !!config.fireworks.apiKey,
        masked: config.fireworks.apiKey ? `${config.fireworks.apiKey.slice(0, 8)}...${config.fireworks.apiKey.slice(-4)}` : null
      }
    };
    
    res.json(apiKeys);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update API keys
router.post('/api-keys', async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' });
    }

    const validProviders = ['openai', 'google', 'anthropic', 'mistral', 'fireworks'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Read current .env file
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';
    
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      // If .env doesn't exist, create it
      envContent = '';
    }

    // Update or add the API key
    const keyName = provider.toUpperCase() + '_API_KEY';
    const keyLine = `${keyName}=${apiKey}`;
    
    // Check if key already exists
    const keyRegex = new RegExp(`^${keyName}=.*$`, 'm');
    
    if (keyRegex.test(envContent)) {
      // Update existing key
      envContent = envContent.replace(keyRegex, keyLine);
    } else {
      // Add new key
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += keyLine + '\n';
    }

    // Write back to .env file
    await fs.writeFile(envPath, envContent);

    // Update the config in memory
    req.app.locals.config[provider].apiKey = apiKey;

    res.json({ success: true, message: `${provider} API key updated successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test API key
router.post('/test-api-key', async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' });
    }

    // Create a temporary config with the test API key
    const testConfig = { ...req.app.locals.config };
    testConfig[provider].apiKey = apiKey;

    // Test the API key by creating a provider and making a simple request
    const { ProviderFactory } = await import('../providers/ProviderFactory.js');
    
    try {
      const providerInstance = ProviderFactory.createProvider(provider, testConfig);
      
      // Make a simple test request
      const testResponse = await providerInstance.generateResponse([
        { role: 'user', content: 'Hello, this is a test message.' }
      ], { maxTokens: 10 });
      
      res.json({ 
        success: true, 
        message: 'API key is valid',
        testResponse: testResponse.content
      });
    } catch (error) {
      res.json({ 
        success: false, 
        message: 'API key test failed: ' + error.message 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all available providers and their models
// Simple test endpoint to debug the issue
router.get('/test-config', (req, res) => {
  try {
    const config = req.app.locals.config;
    res.json({
      openaiHasKey: !!config.openai?.apiKey,
      anthropicHasKey: !!config.anthropic?.apiKey,
      providers: Object.keys(config.providers || {}),
      configKeys: Object.keys(config)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New test endpoint with working providers
router.get('/providers-fixed', (req, res) => {
  try {
    const config = req.app.locals.config;
    const providers = config.providers || {};
    
    const providerList = Object.keys(providers).map(key => {
      const provider = providers[key];
      return {
        key,
        name: key,
        displayName: provider.displayName,
        logo: provider.logo,
        models: provider.models,
        bestModel: provider.bestModel,
        description: provider.description,
        supportsImages: provider.supportsImages,
        supportsStreaming: provider.supportsStreaming,
        hasApiKey: key === 'openai' ? !!config.openai?.apiKey : 
                   key === 'anthropic' ? !!config.anthropic?.apiKey :
                   key === 'mistral' ? !!config.mistral?.apiKey :
                   key === 'google' ? !!config.google?.apiKey :
                   key === 'fireworks' ? !!config.fireworks?.apiKey :
                   false
      };
    });
    
    res.json({ providers: providerList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/providers', (req, res) => {
  res.json({
    providers: [
      {
        key: 'openai',
        name: 'openai',
        displayName: 'OpenAI',
        logo: '🤖',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-4-vision-preview'],
        bestModel: 'gpt-4o',
        description: "OpenAI's GPT4-o model.",
        supportsImages: true,
        supportsStreaming: true,
        hasApiKey: true
      },
      {
        key: 'anthropic',
        name: 'anthropic',
        displayName: 'Anthropic',
        logo: '🧠',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
        bestModel: 'claude-3-5-sonnet-20241022',
        description: "Anthropic's balanced Claude 4 model.",
        supportsImages: true,
        supportsStreaming: true,
        hasApiKey: false
      },
      {
        key: 'mistral',
        name: 'mistral',
        displayName: 'Mistral',
        logo: '🌊',
        models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
        bestModel: 'mistral-large-latest',
        description: "Mistral's large model.",
        supportsImages: false,
        supportsStreaming: true,
        hasApiKey: false
      },
      {
        key: 'google',
        name: 'google',
        displayName: 'Google',
        logo: '⭐',
        models: ['gemini-2.5-pro', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'],
        bestModel: 'gemini-2.5-pro',
        description: "Google's powerful model.",
        supportsImages: true,
        supportsStreaming: true,
        hasApiKey: false
      },
      {
        key: 'fireworks',
        name: 'fireworks',
        displayName: 'Fireworks',
        logo: '🎆',
        models: ['llama-v3p1-70b-instruct', 'llama-v3p1-8b-instruct'],
        bestModel: 'llama-v3p1-70b-instruct',
        description: "Fireworks' high-performance models.",
        supportsImages: false,
        supportsStreaming: true,
        hasApiKey: false
      }
    ]
  });
});

export default router;
