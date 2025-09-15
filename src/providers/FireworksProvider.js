import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';

export class FireworksProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.fireworks.apiKey;
    this.baseURL = 'https://api.fireworks.ai/inference/v1';
  }

  validateApiKey() {
    return !!this.apiKey;
  }

  getSupportedModels() {
    return ['llama-v3p1-70b-instruct', 'llama-v3p1-8b-instruct', 'qwen-2.5-72b-instruct', 'qwen-2.5-14b-instruct'];
  }

  supportsImages() {
    return false;
  }

  supportsStreaming() {
    return true;
  }

  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: Array.isArray(msg.content) ? msg.content.map(item => item.text || item).join('') : msg.content
    }));
  }

  async generateResponse(messages, options = {}) {
    try {
      const formattedMessages = this.formatMessages(messages);
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: options.model || 'llama-v3p1-70b-instruct',
        messages: formattedMessages,
        max_tokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature,
        stream: false,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
        model: response.data.model,
        provider: 'fireworks'
      };
    } catch (error) {
      throw new Error(`Fireworks API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async generateStreamResponse(messages, options = {}) {
    try {
      const formattedMessages = this.formatMessages(messages);
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: options.model || 'llama-v3p1-70b-instruct',
        messages: formattedMessages,
        max_tokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature,
        stream: true,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
      });

      return response.data;
    } catch (error) {
      throw new Error(`Fireworks streaming error: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}
