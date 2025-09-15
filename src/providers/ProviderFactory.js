import { OpenAIProvider } from './OpenAIProvider.js';
import { GoogleProvider } from './GoogleProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { MistralProvider } from './MistralProvider.js';
import { FireworksProvider } from './FireworksProvider.js';

export class ProviderFactory {
  static createProvider(providerName, config) {
    switch (providerName.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'google':
      case 'gemini':
        return new GoogleProvider(config);
      case 'anthropic':
      case 'claude':
        return new AnthropicProvider(config);
      case 'mistral':
        return new MistralProvider(config);
      case 'fireworks':
        return new FireworksProvider(config);
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  static getAvailableProviders(config) {
    const providers = [];
    
    // Get all provider configurations
    const providerConfigs = config.providers || {};
    
    Object.keys(providerConfigs).forEach(providerKey => {
      const providerConfig = providerConfigs[providerKey];
      const hasApiKey = this.checkApiKey(config, providerKey);
      
      if (hasApiKey) {
        providers.push({
          name: providerKey,
          displayName: providerConfig.displayName,
          logo: providerConfig.logo,
          models: providerConfig.models,
          bestModel: providerConfig.bestModel,
          description: providerConfig.description,
          supportsImages: providerConfig.supportsImages,
          supportsStreaming: providerConfig.supportsStreaming
        });
      }
    });
    
    return providers;
  }

  static checkApiKey(config, providerKey) {
    switch (providerKey) {
      case 'openai':
        return !!config.openai?.apiKey;
      case 'google':
        return !!config.google?.apiKey;
      case 'anthropic':
        return !!config.anthropic?.apiKey;
      case 'mistral':
        return !!config.mistral?.apiKey;
      case 'fireworks':
        return !!config.fireworks?.apiKey;
      default:
        return false;
    }
  }
}
