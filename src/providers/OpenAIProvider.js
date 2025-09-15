import OpenAI from 'openai';
import { BaseProvider } from './BaseProvider.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  validateApiKey() {
    return !!this.config.openai.apiKey;
  }

  getSupportedModels() {
    return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4-vision-preview'];
  }

  supportsImages() {
    return true;
  }

  supportsStreaming() {
    return true;
  }

  formatMessages(messages) {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return { role: 'system', content: msg.content };
      }
      
      if (msg.role === 'user') {
        // Handle both text and image content
        if (Array.isArray(msg.content)) {
          return {
            role: 'user',
            content: msg.content.map(item => {
              if (item.type === 'text') {
                return { type: 'text', text: item.text };
              } else if (item.type === 'image_url') {
                return {
                  type: 'image_url',
                  image_url: {
                    url: item.image_url.url,
                    detail: item.image_url.detail || 'auto'
                  }
                };
              }
              return item;
            })
          };
        } else {
          return { role: 'user', content: msg.content };
        }
      }
      
      if (msg.role === 'assistant') {
        return { role: 'assistant', content: msg.content };
      }
      
      return msg;
    });
  }

  async generateResponse(messages, options = {}) {
    try {
      const formattedMessages = this.formatMessages(messages);
      
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.llm.defaultModel,
        messages: formattedMessages,
        max_tokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature,
        stream: false,
      });

      return {
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model,
        provider: 'openai'
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async generateStreamResponse(messages, options = {}) {
    try {
      const formattedMessages = this.formatMessages(messages);
      
      const stream = await this.client.chat.completions.create({
        model: options.model || this.config.llm.defaultModel,
        messages: formattedMessages,
        max_tokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature,
        stream: true,
      });

      return stream;
    } catch (error) {
      throw new Error(`OpenAI streaming error: ${error.message}`);
    }
  }
}
