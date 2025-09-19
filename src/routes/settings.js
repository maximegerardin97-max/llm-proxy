import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
router.get('/providers', (req, res) => {
  try {
    const config = req.app.locals.config;
    const providers = config.providers || {};
    
    const providerList = Object.keys(providers).map(key => {
      const provider = providers[key];
      return {
        key,
        name: provider.displayName,
        logo: provider.logo,
        models: provider.models,
        bestModel: provider.bestModel,
        description: provider.description,
        supportsImages: provider.supportsImages,
        supportsStreaming: provider.supportsStreaming,
        hasApiKey: !!config[key]?.apiKey
      };
    });
    
    res.json({ providers: providerList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
