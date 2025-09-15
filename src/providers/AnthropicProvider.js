import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './BaseProvider.js';

export class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  validateApiKey() {
    return !!this.config.anthropic.apiKey;
  }

  getSupportedModels() {
    return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
  }

  supportsImages() {
    return true;
  }

  supportsStreaming() {
    return true;
  }

  formatMessages(messages) {
    // Convert OpenAI format to Anthropic format
    const systemMessage = messages.find(msg => msg.role === 'system');
    const conversationMessages = messages.filter(msg => msg.role !== 'system');
    
    const formattedMessages = conversationMessages.map(msg => {
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
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: item.image_url.url.split(',')[1]
                  }
                };
              }
              return item;
            })
          };
        } else {
          return { role: 'user', content: msg.content };
        }
      } else if (msg.role === 'assistant') {
        return { role: 'assistant', content: msg.content };
      }
      return msg;
    });

    return {
      system: systemMessage?.content || '',
      messages: formattedMessages
    };
  }

  async generateResponse(messages, options = {}) {
    try {
      const { system, messages: formattedMessages } = this.formatMessages(messages);
      
      const response = await this.client.messages.create({
        model: options.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature,
        system: system,
        messages: formattedMessages,
      });

      return {
        content: response.content[0].text,
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        },
        model: response.model,
        provider: 'anthropic'
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async generateStreamResponse(messages, options = {}) {
    try {
      const { system, messages: formattedMessages } = this.formatMessages(messages);
      
      const stream = await this.client.messages.create({
        model: options.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature,
        system: system,
        messages: formattedMessages,
        stream: true,
      });

      return stream;
    } catch (error) {
      throw new Error(`Anthropic streaming error: ${error.message}`);
    }
  }
}
