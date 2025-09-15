export class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  async generateResponse(messages, options = {}) {
    throw new Error('generateResponse method must be implemented by subclass');
  }

  async generateStreamResponse(messages, options = {}) {
    throw new Error('generateStreamResponse method must be implemented by subclass');
  }

  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  validateApiKey() {
    throw new Error('validateApiKey method must be implemented by subclass');
  }

  getSupportedModels() {
    throw new Error('getSupportedModels method must be implemented by subclass');
  }

  supportsImages() {
    return false;
  }

  supportsStreaming() {
    return false;
  }
}
