import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './BaseProvider.js';

export class GoogleProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.genAI = new GoogleGenerativeAI(config.google.apiKey);
  }

  validateApiKey() {
    return !!this.config.google.apiKey;
  }

  getSupportedModels() {
    return ['gemini-pro', 'gemini-pro-vision'];
  }

  supportsImages() {
    return true;
  }

  supportsStreaming() {
    return true;
  }

  formatMessages(messages) {
    // Google Gemini uses a different message format
    const formattedMessages = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        // Gemini doesn't have a system role, so we prepend it to the first user message
        if (formattedMessages.length === 0 || formattedMessages[0].role !== 'user') {
          formattedMessages.unshift({
            role: 'user',
            parts: [{ text: `System: ${msg.content}` }]
          });
        } else {
          formattedMessages[0].parts[0].text = `System: ${msg.content}\n\n${formattedMessages[0].parts[0].text}`;
        }
      } else if (msg.role === 'user') {
        const parts = [];
        
        if (Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.type === 'text') {
              parts.push({ text: item.text });
            } else if (item.type === 'image_url') {
              // Convert base64 image to proper format for Gemini
              const base64Data = item.image_url.url.split(',')[1];
              parts.push({
                inline_data: {
                  mime_type: 'image/jpeg', // Default to JPEG, could be improved
                  data: base64Data
                }
              });
            }
          }
        } else {
          parts.push({ text: msg.content });
        }
        
        formattedMessages.push({
          role: 'user',
          parts: parts
        });
      } else if (msg.role === 'assistant') {
        formattedMessages.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      }
    }
    
    return formattedMessages;
  }

  async generateResponse(messages, options = {}) {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: options.model || 'gemini-pro' 
      });
      
      const formattedMessages = this.formatMessages(messages);
      
      // Convert to Gemini's chat format
      const chat = model.startChat({
        history: formattedMessages.slice(0, -1), // All but the last message
      });
      
      const lastMessage = formattedMessages[formattedMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts);
      const response = await result.response;
      
      return {
        content: response.text(),
        usage: {
          prompt_tokens: 0, // Gemini doesn't provide detailed token usage
          completion_tokens: 0,
          total_tokens: 0
        },
        model: options.model || 'gemini-pro',
        provider: 'google'
      };
    } catch (error) {
      throw new Error(`Google Gemini API error: ${error.message}`);
    }
  }

  async generateStreamResponse(messages, options = {}) {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: options.model || 'gemini-pro' 
      });
      
      const formattedMessages = this.formatMessages(messages);
      
      // Convert to Gemini's chat format
      const chat = model.startChat({
        history: formattedMessages.slice(0, -1), // All but the last message
      });
      
      const lastMessage = formattedMessages[formattedMessages.length - 1];
      const result = await chat.sendMessageStream(lastMessage.parts);
      
      return result.stream;
    } catch (error) {
      throw new Error(`Google Gemini streaming error: ${error.message}`);
    }
  }
}
