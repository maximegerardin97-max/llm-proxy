import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';

export class MistralProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.mistral.apiKey;
    this.baseURL = 'https://api.mistral.ai/v1';
  }

  validateApiKey() {
    return !!this.apiKey;
  }

  getSupportedModels() {
    return ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'];
  }

  supportsImages() {
    return false;
  }

  supportsStreaming() {
    return true;
  }

  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role,
      content: Array.isArray(msg.content) ? msg.content.map(item => item.text || item).join('') : msg.content
    }));
  }

  async generateResponse(messages, options = {}) {
    try {
      const formattedMessages = this.formatMessages(messages);
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: options.model || 'mistral-large-latest',
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
        provider: 'mistral'
      };
    } catch (error) {
      throw new Error(`Mistral API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async generateStreamResponse(messages, options = {}) {
    try {
      const formattedMessages = this.formatMessages(messages);
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: options.model || 'mistral-large-latest',
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
      throw new Error(`Mistral streaming error: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}
